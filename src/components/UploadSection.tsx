/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  CloudUpload, 
  FileCheck, 
  AlertCircle, 
  Loader2, 
  Database, 
  Trash2, 
  Info,
  Activity,
  Stethoscope,
  Hospital,
  History,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { motion } from 'motion/react';
import { parseExcelFile, processCID, normalizeName, isValidCID, extractHospitalSummaryData } from '../lib/excelProcessor';
import { normalizeCidForComparison, getCompulsoryCids } from '../lib/notificacoesProcessor';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { FileType, Profile, UploadDoc } from '../types';
import { INSTITUTIONAL_GREEN, UNITS } from '../constants';

interface FileWithUnit extends File {
  identifiedUnit?: string | null;
}

interface FileStatus {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  progress: number;
  message?: string;
  warning?: string;
  recordsCount?: number;
  type?: string;
}

interface UploadSectionProps {
  profile?: Profile | null;
}

const UploadSection: React.FC<UploadSectionProps> = ({ profile }) => {
  const [files, setFiles] = useState<FileWithUnit[]>([]);
  const [manualUnits, setManualUnits] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<Record<string, FileStatus>>({});
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string; summary?: any }>({ type: null, message: '' });
  const [uploadHistory, setUploadHistory] = useState<UploadDoc[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Duplicity Check States
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflicts, setConflicts] = useState<any[]>([]);

  const isAdmin = profile?.role === 'admin';

  const fetchHistory = React.useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('uploads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      setUploadHistory(data || []);
    } catch (err: any) {
      console.error("Erro ao buscar histórico:", err);
      if (err.code === 'PGRST205' || err.message?.includes('Could not find the table')) {
        setStatus({ 
          type: 'error', 
          message: 'Tabela "uploads" não encontrada no Supabase. Por favor, execute o script SQL atualizado (arquivo supabase_schema.sql) no seu SQL Editor do Supabase.' 
        });
      }
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  React.useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!isAdmin) {
      alert("Operação não permitida. Apenas administradores podem fazer upload de dados.");
      return;
    }

    const guessTypeFromName = (name: string): string => {
      const n = name.toLowerCase();
      if (n.includes('cid')) return 'CIDs';
      if (n.includes('exame')) return 'Exames';
      if (n.includes('atestado')) return 'Atestados';
      if (n.includes('atendimento') || n.includes('producao') || n.includes('produção')) return 'Atendimentos';
      return 'Unknown';
    };

    const updatedFiles = await Promise.all(acceptedFiles.map(async (file) => {
      // Create a temporary read to identify unit and type without full processing yet
      try {
        const { identifiedUnit, type, data } = await parseExcelFile(file);
        const fWithUnit = file as FileWithUnit;
        fWithUnit.identifiedUnit = identifiedUnit;
        
        // Check for mismatch
        const suggestedByName = guessTypeFromName(file.name);
        let warning = '';
        if (type !== 'Unknown' && suggestedByName !== 'Unknown' && type !== suggestedByName) {
          warning = `Aviso: O conteúdo parece ser de "${type}", mas o nome do arquivo sugere "${suggestedByName}".`;
        }

        setFileStatuses(prev => ({
          ...prev,
          [file.name]: {
            id: crypto.randomUUID(),
            name: file.name,
            status: 'pending',
            progress: 0,
            type,
            recordsCount: data.length,
            warning
          }
        }));

        return fWithUnit;
      } catch (err) {
        setFileStatuses(prev => ({
          ...prev,
          [file.name]: {
            id: crypto.randomUUID(),
            name: file.name,
            status: 'pending',
            progress: 0
          }
        }));
        return file as FileWithUnit;
      }
    }));
    
    setFiles(prev => [...prev, ...updatedFiles]);
    setStatus({ type: null, message: '' });
  }, [isAdmin]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    }
  } as any);

  const clearHistory = async () => {
    if (!window.confirm('Tem certeza que deseja APAGAR todo o histórico de dados? Esta ação não pode ser desfeita.')) return;
    
    setIsProcessing(true);
    setStatus({ type: null, message: '' });
    try {
      const tables = ['atendimentos', 'cids', 'atestados', 'exames', 'uploads'];
      
      for (const table of tables) {
        // We need a filter for Supabase to allow deletion. 
        // Using gte('created_at', '1970-01-01') is a safe way to target all rows in tables that have a created_at timestamp.
        // For tables that don't, we'll try a fallback or generic filter.
        const { error } = await supabase
          .from(table)
          .delete()
          .gte('created_at', '1970-01-01T00:00:00Z');

        if (error) {
          console.error(`Error deleting from ${table}:`, error);
          throw error;
        }
      }
      
      setStatus({ type: 'success', message: `Base de dados apagada com sucesso.` });
      fetchHistory();
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Erro ao apagar dados no banco de dados.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const checkConflicts = async () => {
    const missingUnits = files.some(f => !f.identifiedUnit && !manualUnits[f.name]);
    if (missingUnits) {
      setStatus({ type: 'error', message: 'Por favor, selecione a unidade para todos os arquivos não identificados.' });
      return;
    }

    setIsProcessing(true);
    setStatus({ type: null, message: '' });
    
    try {
      const foundConflicts = [];
      
      for (const file of files) {
        const { type, identifiedUnit, meta } = await parseExcelFile(file);
        const finalUnit = identifiedUnit || file.identifiedUnit || manualUnits[file.name];
        
        if (!finalUnit || !meta.mes || !meta.ano) continue;
        
        const tableName = type === 'CIDs' ? 'cids' : type.toLowerCase();
        if (tableName === 'unknown') continue;

        // Check if records exist for this combination
        const { count, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })
          .eq('unidade', finalUnit)
          .eq('mes', meta.mes)
          .eq('ano', meta.ano);
        
        if (!error && count && count > 0) {
          foundConflicts.push({
            file: file.name,
            unit: finalUnit,
            mes: meta.mes,
            ano: meta.ano,
            type: type,
            records: count,
            tableName
          });
        }
      }

      if (foundConflicts.length > 0) {
        setConflicts(foundConflicts);
        setShowConflictModal(true);
        setIsProcessing(false);
      } else {
        processFiles();
      }
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      setStatus({ type: 'error', message: 'Erro ao verificar duplicidade.' });
    }
  };

  const processFiles = async (shouldDeleteExisting = false) => {
    setIsProcessing(true);
    setShowConflictModal(false);
    setStatus({ type: null, message: '' });
    
    try {
      if (shouldDeleteExisting && conflicts.length > 0) {
        for (const conflict of conflicts) {
          await supabase
            .from(conflict.tableName)
            .delete()
            .eq('unidade', conflict.unit)
            .eq('mes', conflict.mes)
            .eq('ano', conflict.ano);
            
          // If CIDs, also clear corresponding Atendimentos as it will be re-aggregated
          if (conflict.tableName === 'cids') {
             await supabase.from('atendimentos').delete()
              .eq('unidade', conflict.unit)
              .eq('mes', conflict.mes)
              .eq('ano', conflict.ano);
          }
        }
      }

      const resultsSummary: Record<string, number> = {
        Atendimentos: 0,
        CIDs: 0,
        Atestados: 0,
        Exames: 0,
        Monitoramento: 0
      };
      let totalRecordsCount = 0;
      let filesSuccess = 0;
      let filesError = 0;

      // Fetch compulsory CIDs once for the entire batch
      const { codes: compulsoryCodes } = await getCompulsoryCids(true);

      for (const file of files) {
        setFileStatuses(prev => ({
          ...prev,
          [file.name]: { ...prev[file.name], status: 'processing', progress: 30 }
        }));

        try {
          const { type, data, rawRows, identifiedUnit, meta } = await parseExcelFile(file);
          const finalUnit = identifiedUnit || file.identifiedUnit || manualUnits[file.name];
          
          if (!finalUnit) throw new Error("Unidade não identificada para este arquivo.");

          if (type === 'Unknown') {
            setFileStatuses(prev => ({
              ...prev,
              [file.name]: { ...prev[file.name], status: 'error', progress: 100, message: 'Formato de colunas não identificado (CID/Atend)' }
            }));
            filesError++;
            continue;
          }

          const tableName = type === 'CIDs' ? 'cids' : type.toLowerCase();
          const processedRows: any[] = [];

          // SPECIAL HANDLING: ATENDIMENTOS (Consolidated Hospital Report)
          if (type === 'Atendimentos') {
            const { totalAtendimentos, mes: sumMes, ano: sumAno, unidade: sumUnit } = extractHospitalSummaryData(rawRows, file.name);
            
            if (totalAtendimentos && totalAtendimentos > 0) {
              const mes = sumMes || meta.mes || new Date().getMonth() + 1;
              const ano = sumAno || meta.ano || new Date().getFullYear();
              const unidade = sumUnit || finalUnit;

              processedRows.push({
                unidade,
                mes,
                ano,
                quantidade: totalAtendimentos,
                timestamp: new Date().toISOString(),
              });
              console.log(`[Consolidado] Detectado: ${totalAtendimentos} atendimentos para ${unidade} em ${mes}/${ano}`);
            } else {
               throw new Error("Não foi possível localizar o 'Total de Atendimentos' na planilha.");
            }
          } else {
            // STANDARD ROW-BY-ROW PROCESSING (CIDs, Exames, Atestados, etc)
            // Dynamic Column Mapper helper
            const findCol = (rowKeys: string[], ...terms: string[]) => {
              const normalizedRowKeys = rowKeys.map(k => ({
                original: k,
                normalized: k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
              }));
              
              const normalizedTerms = terms.map(t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
              
              // 1. Try exact matches first for all terms
              for (const term of normalizedTerms) {
                const exactMatch = normalizedRowKeys.find(rk => rk.normalized === term);
                if (exactMatch) return exactMatch.original;
              }
              
              // 2. Try specific start/end matches (more reliable than 'includes')
              for (const term of normalizedTerms) {
                const smartMatch = normalizedRowKeys.find(rk => rk.normalized.startsWith(term) || rk.normalized.endsWith(term));
                if (smartMatch) return smartMatch.original;
              }
  
              // 3. Last resort fallback to includes
              for (const term of normalizedTerms) {
                const partialMatch = normalizedRowKeys.find(rk => rk.normalized.includes(term));
                if (partialMatch) return partialMatch.original;
              }
              
              return undefined;
            };

            const cleanup = (val: any) => {
              if (val === undefined || val === null) return null;
              const str = String(val).trim();
              return str === "" || str === "-" || str === "." ? null : str;
            };

            if (data.length > 0) {
              console.log(`[Upload] Iniciando processamento de ${file.name} (${type})`);
              console.log(`[Upload] Exemplo da primeira linha bruta:`, data[0]);
            }

            let invalidCidCount = 0;

            data.forEach((row, idx) => {
              // IGNORE EMPTY ROWS
              if (!row || Object.values(row).every(v => v === "" || v === null || v === undefined)) return;

              const rowKeys = Object.keys(row);
              const mes = parseInt(row.Mês || row['Mês'] || meta.mes || new Date().getMonth() + 1);
              const ano = parseInt(row.Ano || row['Ano'] || meta.ano || new Date().getFullYear());

              let processedRow: any = {
                unidade: finalUnit,
                mes,
                ano,
                timestamp: new Date().toISOString(),
              };

              try {
                if (type === 'CIDs') {
                  const cidKey = findCol(rowKeys, 'cid', 'codigo cid', 'diagnostico', 'cod cid');
                  const pacKey = findCol(rowKeys, 'paciente', 'nome', 'pront');
                  const dateKey = findCol(rowKeys, 'data de atendimento', 'data', 'realizacao', 'entrada');
                  
                  const cidVal = cleanup(row[cidKey || '']);
                  const pacVal = cleanup(row[pacKey || '']) || "Não Identificado";

                  const { code, description } = processCID(cidVal);
                  
                  // Validação de CID
                  if (code !== 'N/I' && !isValidCID(code)) {
                    invalidCidCount++;
                  }

                  processedRow.codigo = code;
                  processedRow.descricao = description;
                  processedRow.paciente = normalizeName(pacVal);
                  
                  // --- Automatic Notification Detection ---
                  const normalizedCid = normalizeCidForComparison(code);
                  if (compulsoryCodes.has(normalizedCid)) {
                    processedRow.is_notificavel = true;
                    processedRow.notificacao_status = 'pendente';
                    console.log(`[Notification] CID compulsório detectado: ${code} (${description})`);
                  } else {
                    processedRow.is_notificavel = false;
                    processedRow.notificacao_status = 'ignorado';
                  }

                  if (dateKey && row[dateKey]) {
                    processedRow.data_atendimento = new Date(row[dateKey]).toISOString();
                  }
                  
                  if (processedRow.codigo !== 'N/I' || processedRow.paciente !== 'NAO IDENTIFICADO') {
                    processedRows.push(processedRow);
                  }
                } 
                else if (type === 'Monitoramento') {
                  const pacKey = findCol(rowKeys, 'paciente', 'nome');
                  const entradaKey = findCol(rowKeys, 'entrada', 'data inicial');
                  const altaKey = findCol(rowKeys, 'alta medica', 'alta');
                  const riscoKey = findCol(rowKeys, 'risco', 'protocolo');

                  processedRow.paciente = normalizeName(cleanup(row[pacKey || '']) || "");
                  if (entradaKey && row[entradaKey]) {
                    processedRow.data_entrada = new Date(row[entradaKey]).toISOString();
                  }
                  if (altaKey && row[altaKey]) {
                    processedRow.data_alta = new Date(row[altaKey]).toISOString();
                  }
                  processedRow.protocolo_risco = cleanup(row[riscoKey || '']);
                  
                  if (processedRow.paciente) {
                    processedRows.push(processedRow);
                  }
                }
                else if (type === 'Exames') {
                  const qtyKey = findCol(rowKeys, 'qtd', 'quantidade', 'total');
                  const examDescKey = findCol(rowKeys, 'procedimento', 'descricao_exame', 'exame', 'descricao', 'nome_exame');
                  
                  let qty = 1;
                  if (qtyKey) {
                    const val = parseInt(row[qtyKey] || 0);
                    qty = isNaN(val) || val === 0 ? 1 : val;
                  }
                  
                  const desc = cleanup(row[examDescKey || '']) || "Não Identificado";
                  
                  // Usamos 'nome' como o campo principal para o Ranking e Dashboard
                  processedRow.nome = desc;
                  processedRow.quantidade = qty;
                  processedRows.push(processedRow);
                } 
                else if (type === 'Atestados') {
                  const cidKey = findCol(rowKeys, 'cid', 'diagnostico', 'causa', 'classificacao', 'cid10', 'cod cid', 'cod_cid', 'descricao cid');
                  const pacKey = findCol(rowKeys, 'paciente', 'nome', 'pront');
                  const dateKey = findCol(rowKeys, 'data cadastro', 'data atestado', 'data', 'criacao');
                  
                  const cidVal = cleanup(row[cidKey || '']);
                  const pacVal = cleanup(row[pacKey || '']) || "Não Identificado";
                  let { code, description } = processCID(cidVal);
                  
                  // Validação de CID inicial
                  if (code !== 'N/I' && !isValidCID(code)) {
                    invalidCidCount++;
                  }

                  processedRow.cid_codigo = code;
                  processedRow.cid_descricao = description;
                  processedRow.quantidade = 1;
                  processedRow.paciente = normalizeName(pacVal);

                  // --- Automatic Notification Detection ---
                  const normalizedCid = normalizeCidForComparison(code);
                  if (compulsoryCodes.has(normalizedCid)) {
                    processedRow.is_notificavel = true;
                    processedRow.notificacao_status = 'pendente';
                    console.log(`[Notification] CID compulsório detectado em atestado: ${code}`);
                  } else {
                    processedRow.is_notificavel = false;
                    processedRow.notificacao_status = 'ignorado';
                  }

                  if (dateKey && row[dateKey]) {
                    processedRow.data_atestado = new Date(row[dateKey]).toISOString();
                  }

                  // Se não achou código CID na coluna designada, procura na linha inteira
                  if (code === 'N/I') {
                    for (const key of rowKeys) {
                      const cellVal = String(row[key] || '');
                      if (cellVal.length >= 3 && /^[A-Z][0-9]/i.test(cellVal)) {
                        const fb = processCID(cellVal);
                        if (fb.code !== 'N/I') {
                          if (isValidCID(fb.code)) {
                            processedRow.cid_codigo = fb.code;
                            processedRow.cid_descricao = fb.description;
                            break;
                          } else {
                            invalidCidCount++;
                          }
                        }
                      }
                    }
                  }

                  if (processedRow.paciente !== 'NAO IDENTIFICADO' || processedRow.cid_codigo !== 'N/I') {
                    processedRows.push(processedRow);
                  }
                }
              } catch (rowErr) {
                console.warn(`Erro na linha ${row.__rowNum}:`, rowErr);
              }
            });

            if (invalidCidCount > 0) {
              console.warn(`[Upload] ${invalidCidCount} códigos CID com formato inválido detectados em ${file.name}`);
              setFileStatuses(prev => ({
                ...prev,
                [file.name]: { 
                  ...prev[file.name], 
                  warning: `${invalidCidCount} códigos CID detectados com formato fora do padrão (ex: Letra + Números). Verifique o relatório.`
                }
              }));
            }
          }

          if (processedRows.length > 0) {
            console.log(`[Upload] Exemplo de linha processada:`, processedRows[0]);
          }

          // Group by unit/month/year/extra to ensure only ONE row per key is sent to Supabase
          const grouped: Record<string, any> = {};
          let finalRowsToInsert: any[] = [];
          
          if (type === 'CIDs') {
            processedRows.forEach(row => {
              const key = `${row.unidade}|${row.mes}|${row.ano}|${row.paciente}|${row.codigo}`;
              if (!grouped[key]) {
                grouped[key] = { ...row };
              }
            });
            finalRowsToInsert = Object.values(grouped);
            resultsSummary.CIDs += finalRowsToInsert.length;
          } else if (type === 'Exames') {
            processedRows.forEach(row => {
              const key = `${row.unidade}|${row.mes}|${row.ano}|${row.nome}`;
              if (!grouped[key]) {
                grouped[key] = { ...row };
              } else {
                grouped[key].quantidade += row.quantidade;
              }
            });
            finalRowsToInsert = Object.values(grouped);
            resultsSummary.Exames += finalRowsToInsert.reduce((sum, r) => sum + r.quantidade, 0);
          } else if (type === 'Atestados') {
            // Agora atestados podem ser individuais, mas para evitar duplicidade no mesmo upload/dia/paciente:
            processedRows.forEach(row => {
              const key = `${row.unidade}|${row.mes}|${row.ano}|${row.paciente}|${row.data_atestado || row.timestamp}|${row.cid_codigo}`;
              if (!grouped[key]) {
                grouped[key] = { ...row };
              }
            });
            finalRowsToInsert = Object.values(grouped);
            resultsSummary.Atestados += finalRowsToInsert.length;
          } else if (type === 'Monitoramento') {
            processedRows.forEach(row => {
              const key = `${row.unidade}|${row.mes}|${row.ano}|${row.paciente}|${row.data_entrada}`;
              if (!grouped[key]) {
                grouped[key] = { ...row };
              }
            });
            finalRowsToInsert = Object.values(grouped);
            resultsSummary.Monitoramento += finalRowsToInsert.length;
          } else {
            // Atendimentos (Already consolidated or standard)
            processedRows.forEach(row => {
              const key = `${row.unidade}|${row.mes}|${row.ano}`;
              if (!grouped[key]) {
                grouped[key] = { ...row };
              } else {
                grouped[key].quantidade += row.quantidade;
              }
            });
            finalRowsToInsert = Object.values(grouped);
            
            // Update summary
            const totalQty = finalRowsToInsert.reduce((sum, r) => sum + r.quantidade, 0);
            if (type === 'Atendimentos') resultsSummary.Atendimentos += totalQty;
          }

          // Inserir os dados processados na tabela correspondente
          if (finalRowsToInsert.length > 0) {
            console.log(`[Upload] Iniciando batch upload para ${tableName === 'monitoramento' ? 'monitoramento' : tableName}.`, {
              tipo: type,
              total_registros: finalRowsToInsert.length,
              role: profile?.role,
              status: profile?.status
            });

            const BATCH_SIZE = 1000;
            let recordsInsertedCount = 0;

            for (let i = 0; i < finalRowsToInsert.length; i += BATCH_SIZE) {
              const batch = finalRowsToInsert.slice(i, i + BATCH_SIZE);
              
              let conflictCols = 'unidade,mes,ano';
              if (type === 'CIDs') {
                conflictCols = 'unidade,mes,ano,paciente,codigo';
              } else if (type === 'Exames') {
                conflictCols = 'unidade,mes,ano,nome';
              } else if (type === 'Atestados') {
                conflictCols = 'unidade,paciente,data_atestado,cid_codigo';
              } else if (type === 'Monitoramento') {
                conflictCols = 'unidade,paciente,data_entrada';
              }

              console.log(`[Upload] Enviando lote ${i / BATCH_SIZE + 1} (${batch.length} registros)...`);

              const { error } = await supabase
                .from(tableName === 'monitoramento' ? 'monitoramento' : tableName)
                .upsert(batch, { 
                  onConflict: conflictCols 
                });
                
              if (error) {
                console.error(`[Upload Error] Erro detalhado de banco (${type}):`, {
                  code: error.code,
                  message: error.message,
                  details: error.details,
                  hint: error.hint,
                  table: tableName === 'monitoramento' ? 'monitoramento' : tableName
                });
                throw error;
              }
              recordsInsertedCount += batch.length;
            }
            
            // --- RECORD UPLOAD HISTORY ---
            const { mes: fileMes, ano: fileAno } = meta;
            const recordsInserted = recordsInsertedCount;

            
            await supabase.from('uploads').insert({
              filename: file.name,
              unidade: finalUnit,
              tipo: type,
              registros: recordsInserted,
              mes: fileMes,
              ano: fileAno
            });
            
            totalRecordsCount += recordsInserted; 

            // --- AUTOMATIC AGGREGATION FOR ATENDIMENTOS (If CIDs) ---
            if (type === 'CIDs') {
              const periodsToSync = Array.from(new Set(rawRows.map(r => `${r.unidade}|${r.mes}|${r.ano}`)));

              for (const period of periodsToSync) {
                const [u, m, a] = period.split('|');
                
                // Get total count for this period from CID table
                const { count, error: countErr } = await supabase
                  .from('cids')
                  .select('*', { count: 'exact', head: true })
                  .eq('unidade', u)
                  .eq('mes', parseInt(m))
                  .eq('ano', parseInt(a));

                if (!countErr && count !== null) {
                  await supabase
                    .from('atendimentos')
                    .upsert({
                      unidade: u,
                      mes: parseInt(m),
                      ano: parseInt(a),
                      quantidade: count,
                      timestamp: new Date().toISOString()
                    }, { onConflict: 'unidade,mes,ano' });
                }
              }
            }
          }

          setFileStatuses(prev => ({
            ...prev,
            [file.name]: { 
              ...prev[file.name], 
              status: 'success', 
              progress: 100, 
              recordsCount: rawRows.length, 
              type 
            }
          }));
          filesSuccess++;
        } catch (err: any) {
          console.error(err);
          filesError++;
          setFileStatuses(prev => ({
            ...prev,
            [file.name]: { 
              ...prev[file.name], 
              status: 'error', 
              progress: 100, 
              message: err.message || 'Erro no processamento' 
            }
          }));
        }
      }

      setStatus({ 
        type: 'success', 
        message: `${totalRecordsCount} novos registros processados com sucesso.`,
        summary: {
          ...resultsSummary,
          filesSuccess,
          filesError,
          totalRecords: totalRecordsCount
        }
      });
      fetchHistory();
    } catch (error: any) {
      console.error(error);
      let msg = 'Erro ao persistir dados no Supabase.';
      if (error.code === 'PGRST204' || error.message?.includes('Could not find the') || error.message?.includes('column')) {
        msg = 'Estrutura do banco de dados desatualizada. Por favor, execute o script SQL do arquivo supabase_schema.sql no Supabase.';
      }
      setStatus({ type: 'error', message: msg });
    } finally {
      setIsProcessing(false);
    }
  };

  const removeFile = (index: number) => {
    const fileName = files[index].name;
    setFiles(prev => prev.filter((_, idx) => idx !== index));
    const newStatuses = { ...fileStatuses };
    delete newStatuses[fileName];
    setFileStatuses(newStatuses);
  };

  return (
    <div className="space-y-6">
      <div className="card-minimal !p-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Upload de Relatórios</h2>
            <p className="text-sm text-slate-400 mt-1">Sincronização automática para base de dados Supabase.</p>
          </div>
          <button 
            onClick={clearHistory}
            className="flex items-center gap-2 px-6 py-2 border border-red-100 text-red-500 rounded-full hover:bg-red-50 transition-all text-[11px] font-bold uppercase tracking-widest"
          >
            <Trash2 className="w-3 h-3" />
            Apagar Dados
          </button>
        </div>

        <div 
          {...getRootProps()} 
          className={`border-2 border-dashed rounded-3xl p-16 text-center transition-all cursor-pointer ${
            isDragActive ? 'border-ints-green bg-green-50/50' : 'border-ints-gray hover:border-ints-green hover:bg-slate-50'
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-4">
            <div className="p-5 bg-ints-green/5 rounded-full border border-ints-green/10">
              <CloudUpload className="w-10 h-10 text-ints-green" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">Arraste seus relatórios</p>
              <p className="text-sm text-slate-400 mt-2 font-medium">Arquivos Excel (.xlsx, .xls) processados instantaneamente</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-6">
              <span className="badge-minimal badge-green bg-white border border-green-100">
                Produção
              </span>
              <span className="badge-minimal badge-green bg-white border border-green-100">
                Epidemiologia
              </span>
              <span className="badge-minimal badge-green bg-white border border-green-100">
                Apoio
              </span>
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10 bg-slate-50 rounded-2xl p-8 border border-ints-gray shadow-inner"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[11px] font-bold text-slate-400 flex items-center gap-2 uppercase tracking-widest">
                Fila de Processamento ({files.length})
              </h3>
              {isProcessing && (
                <div className="flex items-center gap-2 text-xs font-bold text-ints-green animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Sincronizando com Supabase...
                </div>
              )}
            </div>
            
            <ul className="space-y-3 mb-8">
              {files.map((f, i) => {
                const fStatus = fileStatuses[f.name];
                return (
                  <li key={i} className={`flex flex-col gap-3 bg-white p-4 rounded-xl border transition-all ${
                    fStatus?.status === 'success' ? 'border-green-100 bg-green-50/10' : 
                    fStatus?.status === 'error' ? 'border-red-100 bg-red-50/10' : 'border-ints-gray'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {fStatus?.status === 'success' ? (
                          <div className="p-1 bg-green-100 rounded-full"><FileCheck className="w-4 h-4 text-green-600" /></div>
                        ) : fStatus?.status === 'error' ? (
                          <div className="p-1 bg-red-100 rounded-full"><AlertCircle className="w-4 h-4 text-red-600" /></div>
                        ) : fStatus?.status === 'processing' ? (
                          <div className="p-1 bg-blue-100 rounded-full"><Loader2 className="w-4 h-4 text-blue-600 animate-spin" /></div>
                        ) : (
                          <FileCheck className="w-5 h-5 text-slate-300" />
                        )}
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700 truncate">{f.name}</span>
                          {(fStatus?.recordsCount !== undefined || fStatus?.type) && (
                            <span className="text-[9px] font-black text-ints-green uppercase tracking-tighter">
                              {fStatus.recordsCount !== undefined ? `${fStatus.recordsCount} registros identificados` : 'Analisando...'} 
                              {fStatus.type ? ` • ${fStatus.type}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {!isProcessing && (
                        <button onClick={() => removeFile(i)} className="text-slate-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    
                    {fStatus?.status === 'processing' && (
                      <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${fStatus.progress}%` }}
                          className="bg-ints-green h-full"
                        />
                      </div>
                    )}

                    {fStatus?.warning && (
                      <div className="text-[10px] font-bold text-amber-500 bg-amber-50 p-2 rounded-lg border border-amber-100 flex items-start gap-1.5 mt-1">
                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{fStatus.warning}</span>
                      </div>
                    )}

                    {fStatus?.message && (
                      <div className="text-[10px] font-bold text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {fStatus.message}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-ints-gray/50 mt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unidade:</span>
                      {f.identifiedUnit ? (
                        <span className="text-[10px] font-bold text-ints-green bg-green-50 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1">
                          <Hospital className="w-3 h-3" /> {f.identifiedUnit} (Auto)
                        </span>
                      ) : (
                        <select 
                          className="text-[10px] font-bold text-slate-600 bg-white border border-ints-gray rounded px-2 py-1 outline-none focus:border-ints-green disabled:opacity-50"
                          value={manualUnits[f.name] || ''}
                          onChange={(e) => setManualUnits(prev => ({ ...prev, [f.name]: e.target.value }))}
                          disabled={isProcessing}
                        >
                          <option value="">Selecionar Unidade...</option>
                          {UNITS.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex justify-end items-center gap-6">
              {!isProcessing && (
                <button 
                  onClick={() => setFiles([])}
                  className="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                >
                  Limpar Fila
                </button>
              )}
              <button 
                onClick={checkConflicts}
                disabled={isProcessing || files.length === 0}
                className="flex items-center gap-3 px-12 py-4 bg-ints-green text-white rounded-full hover:bg-ints-green-dark transition-all text-xs font-black uppercase tracking-widest shadow-xl shadow-green-100 hover:shadow-2xl disabled:opacity-50 disabled:shadow-none"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processando...
                  </>
                ) : (
                  <>Iniciar Sincronização</>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {status.type === 'success' && status.summary && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-8 p-10 bg-green-50 border border-green-100 rounded-[2rem] shadow-sm"
          >
            <div className="flex items-center gap-5 mb-10">
              <div className="p-4 bg-ints-green rounded-2xl shadow-lg shadow-green-100">
                <FileCheck className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-ints-green uppercase tracking-tight">Sincronização Finalizada</h3>
                <p className="text-xs font-bold text-green-700/60 uppercase tracking-widest">Resumo do processamento em lote</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="bg-white p-6 rounded-2xl border border-green-200/50 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Arquivos com Sucesso</p>
                <p className="text-3xl font-black text-ints-green">{status.summary.filesSuccess}</p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-green-200/50 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total de Registros</p>
                <p className="text-3xl font-black text-slate-800">{status.summary.totalRecords.toLocaleString()}</p>
              </div>
              <div className={`p-6 rounded-2xl border shadow-sm ${status.summary.filesError > 0 ? 'bg-rose-50 border-rose-100' : 'bg-white border-green-200/50'}`}>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Arquivos com Erro</p>
                <p className={`text-3xl font-black ${status.summary.filesError > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                  {status.summary.filesError}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-8 border-b border-green-100">
              {Object.entries(status.summary)
                .filter(([key]) => !['filesSuccess', 'filesError', 'totalRecords'].includes(key))
                .map(([key, val]: [string, any]) => (
                  <div key={key} className="bg-white/40 p-4 rounded-xl">
                    <p className="text-[9px] font-black text-green-600/60 uppercase tracking-[0.15em] mb-1">{key}</p>
                    <p className="text-lg font-black text-green-900">{val.toLocaleString()}</p>
                  </div>
              ))}
            </div>
            
            <div className="mt-8 flex justify-between items-center">
              <p className="text-[10px] font-bold text-green-700/50 uppercase tracking-widest">
                Todos os dados foram persistidos no Supabase com sucesso.
              </p>
              <button 
                onClick={() => { setStatus({ type: null, message: '' }); setFiles([]); }}
                className="px-8 py-3 bg-ints-green text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-ints-green-dark transition-all shadow-lg shadow-green-100"
              >
                Entendido, limpar fila
              </button>
            </div>
          </motion.div>
        )}

        {status.type === 'error' && (
          <div className="mt-8 p-6 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-4 text-red-700">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <div>
              <p className="text-sm font-black uppercase tracking-tight">Erro no Processamento</p>
              <p className="text-xs font-medium opacity-80">{status.message}</p>
            </div>
          </div>
        )}
      </div>

      {/* DUPLICITY WARNING MODAL */}
      {showConflictModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full overflow-hidden border border-white"
          >
            <div className="p-8 bg-rose-50 border-b border-rose-100 flex items-center gap-4">
              <div className="p-3 bg-rose-500 rounded-2xl shadow-lg shadow-rose-200">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-rose-900 uppercase tracking-tight">Dados já existentes</h3>
                <p className="text-xs font-bold text-rose-700/60 uppercase tracking-widest">Conflito de registros detectado</p>
              </div>
            </div>

            <div className="p-8">
              <p className="text-sm text-slate-600 leading-relaxed">
                Identificamos que já existem dados no sistema para os períodos e unidades abaixo. 
                <span className="font-bold text-slate-800"> O que você deseja fazer?</span>
              </p>

              <div className="mt-6 space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {conflicts.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{c.type}</span>
                      <span className="text-xs font-bold text-slate-700">{c.unit} • {c.mes}/{c.ano}</span>
                    </div>
                    <span className="badge-minimal bg-rose-100 text-rose-600 border-rose-200">{c.records} registros</span>
                  </div>
                ))}
              </div>

              <div className="mt-10 grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setShowConflictModal(false)}
                  className="px-6 py-4 rounded-2xl border border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => processFiles(true)}
                  className="px-6 py-4 rounded-2xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-100"
                >
                  Substituir Dados
                </button>
              </div>
              <p className="mt-6 text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                A substituição apagará os registros antigos e salvará os novos.
              </p>
            </div>
          </motion.div>
        </div>
      )}

      <div className="card-minimal !bg-green-50 border-green-100 flex items-start gap-6 overflow-hidden relative">
        <div className="p-4 bg-white rounded-2xl shadow-sm border border-green-100 shrink-0">
          <Info className="w-6 h-6 text-ints-green" />
        </div>
        <div className="relative z-10">
          <h4 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Protocolo de Importação</h4>
          <ul className="mt-4 space-y-3 text-slate-500 text-xs">
             <li className="flex gap-2">
                 <span className="text-ints-green font-bold">•</span>
                 <span>Estrutura: Colunas "Quantidade", "CID", "Exames" ou "Atestados" são identificadas via IA.</span>
             </li>
             <li className="flex gap-2">
                 <span className="text-ints-green font-bold">•</span>
                 <span>Relacional: Mês e Ano são extraídos do conteúdo para gerar métricas de séries históricas.</span>
             </li>
             <li className="flex gap-2">
                 <span className="text-ints-green font-bold">•</span>
                 <span>Convergência: Arquivos com múltiplas abas processam apenas o índice zero do workbook.</span>
             </li>
          </ul>
        </div>
        <div className="absolute -right-8 -bottom-8 p-8 opacity-20 rotate-12">
          <Hospital className="w-32 h-32 text-ints-green" />
        </div>
      </div>

      {/* Upload History Section */}
      <div className="card-minimal !p-10 border-slate-200/60 shadow-sm">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-100 rounded-2xl shadow-inner">
              <History className="w-6 h-6 text-slate-500" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Registro de Atividades</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Últimos uploads processados com sucesso</p>
            </div>
          </div>
          <button 
            onClick={fetchHistory}
            className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 rounded-xl transition-all text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100"
            disabled={loadingHistory}
          >
            <Loader2 className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''}`} />
            Sincronizar Lista
          </button>
        </div>

        {uploadHistory.length > 0 ? (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-left min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-3 pb-5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Nome do Arquivo</th>
                  <th className="px-3 pb-5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Tipo / Categoria</th>
                  <th className="px-3 pb-5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Unidade</th>
                  <th className="px-3 pb-5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Período</th>
                  <th className="px-3 pb-5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Registros</th>
                  <th className="px-3 pb-5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {uploadHistory.map((upload) => {
                  const uploadDate = upload.created_at ? new Date(upload.created_at) : null;
                  const formattedDate = uploadDate ? uploadDate.toLocaleDateString('pt-BR') : '-';
                  const formattedTime = uploadDate ? uploadDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                  const monthLabels = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                  
                  return (
                    <tr key={upload.id} className="group hover:bg-slate-50/50 transition-all">
                      <td className="px-3 py-5">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm group-hover:border-ints-green/20 group-hover:shadow-green-100/20 transition-all">
                            {upload.tipo === 'Atendimentos' ? <Activity className="w-4 h-4 text-blue-500" /> :
                             upload.tipo === 'CIDs' ? <Stethoscope className="w-4 h-4 text-purple-500" /> :
                             upload.tipo === 'Exames' ? <Database className="w-4 h-4 text-green-500" /> :
                             <FileCheck className="w-4 h-4 text-orange-500" />}
                          </div>
                          <span className="text-xs font-bold text-slate-700 truncate max-w-[180px] group-hover:text-ints-green transition-colors">{upload.filename}</span>
                        </div>
                      </td>
                      <td className="px-3 py-5">
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                          upload.tipo === 'Atendimentos' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                          upload.tipo === 'CIDs' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                          upload.tipo === 'Exames' ? 'bg-green-50 text-green-600 border-green-100' :
                          'bg-orange-50 text-orange-600 border-orange-100'
                        }`}>
                          {upload.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-5">
                        <div className="flex items-center gap-2">
                          <Hospital className="w-3 h-3 text-slate-300" />
                          <span className="text-[10px] font-bold text-slate-500 uppercase">{upload.unidade}</span>
                        </div>
                      </td>
                      <td className="px-3 py-5">
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          {monthLabels[upload.mes - 1]} / {upload.ano}
                        </span>
                      </td>
                      <td className="px-3 py-5">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black text-slate-700">{upload.registros.toLocaleString()}</span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase">Linhas</span>
                        </div>
                      </td>
                      <td className="px-3 py-5 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-slate-600">{formattedDate}</span>
                          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                            <Clock className="w-2.5 h-2.5" />
                            {formattedTime}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-20 text-center bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
            <div className="inline-flex p-6 bg-white rounded-[2rem] shadow-sm mb-6">
              <History className="w-10 h-10 text-slate-200" />
            </div>
            <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Sem atividades recentes</h4>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Os uploads realizados aparecerão aqui para sua conferência.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadSection;
