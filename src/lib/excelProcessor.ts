/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { FileType } from '../types';

export const identifyFileType = (headers: string[], fileName?: string): FileType => {
  const normalized = headers.map(h => h.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const fn = fileName?.toLowerCase() || '';
  
  // 1. Content-based detection (Priority)
  // Exames
  if (
    normalized.some(h => h.includes('procedimento')) && 
    (normalized.some(h => h.includes('solicitacao')) || 
     normalized.some(h => h.includes('cod. exame')) || 
     normalized.some(h => h.includes('realizacao')) ||
     normalized.some(h => h.includes('n sol')) ||
     normalized.some(h => h.includes('grupo')))
  ) return 'Exames';

  // Atestados
  if (
    normalized.some(h => h.includes('documento')) && 
    normalized.some(h => h.includes('paciente')) &&
    normalized.some(h => h.includes('acomod'))
  ) return 'Atestados';

  // CIDs (Atendimentos Analítico)
  if (
    normalized.some(h => h.includes('cid')) && 
    (normalized.some(h => h.includes('pront')) || normalized.some(h => h.includes('atend')))
  ) return 'CIDs';
  
  // Monitoramento de Atendimento
  if (
    normalized.some(h => h.includes('entrada')) && 
    normalized.some(h => h.includes('alta medica') || h.includes('acolhimento')) &&
    normalized.some(h => h.includes('paciente'))
  ) return 'Monitoramento';

  // Atendimentos / Produção (Mover para o fim para evitar falso positivo com monitoramento)
  if (
    normalized.some(h => h.includes('quantidade')) || 
    normalized.some(h => h.includes('atendimento'))
  ) return 'Atendimentos';

  // 2. Filename-based detection (Fallback)
  if (fn.includes('monitoramento') || fn.includes('tempo')) return 'Monitoramento';
  if (fn.includes('exame')) return 'Exames';
  if (fn.includes('atestado')) return 'Atestados';
  if (fn.includes('cid')) return 'CIDs';
  if (fn.includes('atendimento') || fn.includes('producao') || fn.includes('produção')) return 'Atendimentos';

  return 'Unknown';
};

export const identifyUnit = (filename: string, data: any[]): string | null => {
  const unitsMap: Record<string, string[]> = {
    'CS24': ['CS24', 'CENTRO DE SAUDE 24 HORAS', '24 HORAS', '24H'],
    'CSI': ['CSI', 'CENTRO DE SAUDE INFANTIL', 'INFANTIL'],
    'UPA': ['UPA', 'UNIDADE DE PRONTO ATENDIMENTO']
  };
  
  const normalizedFilename = filename.toUpperCase();
  
  // 1. Check filename
  for (const [unit, keywords] of Object.entries(unitsMap)) {
    if (keywords.some(k => normalizedFilename.includes(k))) return unit;
  }

  // 2. Check content (headers or first few rows)
  if (data.length > 0) {
    const firstRowText = JSON.stringify(data[0]).toUpperCase();
    for (const [unit, keywords] of Object.entries(unitsMap)) {
      if (keywords.some(k => firstRowText.includes(k))) return unit;
    }
  }

  return null;
};

export const parseExcelFile = async (file: File): Promise<{ type: FileType; data: any[]; rawRows: any[][]; identifiedUnit: string | null; meta: { mes: number | null; ano: number | null } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (!result) {
          resolve({ type: 'Unknown', data: [], rawRows: [], identifiedUnit: null, meta: { mes: null, ano: null } });
          return;
        }

        const arrayBuffer = result as ArrayBuffer;
        
        let workbook: XLSX.WorkBook | null = null;
        const readOptions: XLSX.ParsingOptions = {
          cellDates: true,
          cellNF: true, // Keep format strings for potential date parsing
          cellText: true,
          cellStyles: false,
          bookVBA: false,
          bookProps: false,
          cellFormula: false,
          codepage: 65001,
          dense: false
        };

        try {
          // Attempt 1: Native ArrayBuffer
          workbook = XLSX.read(arrayBuffer, { ...readOptions, type: 'array' });
        } catch (readErr: any) {
          console.warn("Standard array read encountered an issue, trying alternatives...", readErr);
          
          try {
            // Attempt 2: Uint8Array (often more stable for browser jszip)
            const u8 = new Uint8Array(arrayBuffer);
            workbook = XLSX.read(u8, { ...readOptions, type: 'array' });
          } catch (err2) {
             try {
                // Attempt 3: Binary string as last resort for non-Zip containers (HTML/XML fake Excel)
                const bytes = new Uint8Array(arrayBuffer);
                let binary = "";
                for (let i = 0; i < bytes.length; i += 8192) {
                  binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
                }
                workbook = XLSX.read(binary, { ...readOptions, type: 'binary' });
             } catch (finalErr) {
                console.error("All Excel read attempts failed:", finalErr);
                throw new Error(`O arquivo Excel está corrompido ou em um formato não suportado. Dica: Abra-o no Excel e salve-o novamente como 'Pasta de Trabalho do Excel (.xlsx)'.`);
             }
          }
        }

        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error("Arquivo Excel vazio ou inválido.");
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 1. Get as array of arrays (RAW)
        const allRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
        
        if (allRows.length === 0) {
          throw new Error("O arquivo parece estar vazio.");
        }

        // 2. Identify Metadata from filename (Priority)
        const identifiedUnit = identifyUnit(file.name, []);
        let { mes: fileMes, ano: fileAno } = extractDateFromFilename(file.name);

        // 3. Identify the Header Row
        // SMPEP files often start at line 10-15, but some start at line 2.
        let headerRowIndex = -1;
        const headerKeywords = [
          'CID', 'PACIENTE', 'ATEND', 'ATENDIMENTO', 'UNIDADE', 'TOTAL',
          'QUANTIDADE', 'PROCEDIMENTO', 'TIPO DE DOCUMENTO', 'QTD.', 'QTD', 'DIAGN', 'CAUSA',
          'PRONTUARIO', 'NOME', 'DESCRICAO', 'CODIGO', 'SOLICITACAO', 'REALIZACAO', 'DATA CADASTRO', 'NR SOL'
        ];
        
        // Search first 100 rows for header
        const searchRange = Math.min(allRows.length, 100);
        const rowsToScan = allRows.slice(0, searchRange);
        
        if (fileMes === null || fileAno === null) {
          const contentDate = extractDateFromContent(rowsToScan);
          if (fileMes === null) fileMes = contentDate.mes;
          if (fileAno === null) fileAno = contentDate.ano;
        }

        // Fallback to current date if still missing
        if (fileMes === null) fileMes = new Date().getMonth() + 1;
        if (fileAno === null) fileAno = new Date().getFullYear();

        for (let i = 0; i < rowsToScan.length; i++) {
          const row = (rowsToScan[i] || []).map(cell => 
            cell ? cell.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : ""
          );
          
          if (row.length === 0) continue;

          // A valid header row should have at least one or two identifying keywords
          const matchCount = row.filter(cell => cell && headerKeywords.some(key => cell.includes(key.toLowerCase()))).length;
          const isTotalRow = row.some(cell => cell.includes('total') || cell.includes('geral'));
          const filledCells = row.filter(cell => cell.length > 0).length;

          // Se tiver pelo menos 2 colunas que pareçam cabeçalho e não for uma linha de total
          if (matchCount >= 2 && filledCells >= 2 && !isTotalRow) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          // Se não encontrou cabeçalho claramente, procura por QUALQUER linha que tenha 'CID' ou 'PROCEDIMENTO' ou 'PACIENTE'
          for (let i = 0; i < rowsToScan.length; i++) {
            const rowStr = JSON.stringify(rowsToScan[i]).toLowerCase();
            if (rowStr.includes('cid') || rowStr.includes('procedimento') || rowStr.includes('paciente')) {
              headerRowIndex = i;
              break;
            }
          }
        }

        if (headerRowIndex === -1) {
          headerRowIndex = 0;
          console.warn("Cabeçalho não identificado claramente, usando linha 0 como padrão.");
        }

        // 4. Extract headers and data
        const rawHeaders = allRows[headerRowIndex].map(h => String(h || "").trim());
        const rawData = allRows.slice(headerRowIndex + 1);
        
        console.log(`[Parser] Arquivo: ${file.name}`);
        console.log(`[Parser] Header detectado na linha: ${headerRowIndex + 1}`);
        console.log(`[Parser] Colunas encontradas:`, rawHeaders);

        const jsonData = rawData
          .filter(row => row && row.some(cell => String(cell || "").trim().length > 0))
          .map((row, idx) => {
            const obj: any = {};
            rawHeaders.forEach((header, index) => {
              if (header && !header.startsWith('__EMPTY')) {
                obj[header] = row[index] !== undefined ? row[index] : "";
              }
            });
            obj.__rowNum = headerRowIndex + idx + 2;
            return obj;
          });

        const type = identifyFileType(rawHeaders, file.name);
        
        resolve({ type, data: jsonData, rawRows: allRows, identifiedUnit, meta: { mes: fileMes, ano: fileAno } });
      } catch (err) {
        console.error("Excel Parsing Error:", err);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = (err) => reject(new Error("Erro físico na leitura do arquivo."));
    reader.readAsArrayBuffer(file);
  });
};

export const extractDateFromFilename = (filename: string): { mes: number | null; ano: number | null } => {
  const normalized = filename.toLowerCase();
  
  const months = [
    'janeiro', 'fevereiro', 'março', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];

  let mes: number | null = null;
  months.forEach((m, i) => {
    if (normalized.includes(m)) {
      mes = i + 1;
    }
  });

  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const ano = yearMatch ? parseInt(yearMatch[1]) : null;

  return { mes, ano };
};

export const extractDateFromContent = (data: any[][]): { mes: number | null; ano: number | null } => {
  const months = [
    'janeiro', 'fevereiro', 'março', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];

  let mes: number | null = null;
  let ano: number | null = null;

  // Search first 50 rows for date indicators
  for (let i = 0; i < Math.min(data.length, 50); i++) {
    const rowString = JSON.stringify(data[i]).toLowerCase();
    
    // Check specific pattern: "Data Inicial: 01/01/2026"
    const dateMatch = rowString.match(/data inicial[:\s]+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (dateMatch) {
      mes = parseInt(dateMatch[2]);
      ano = parseInt(dateMatch[3]);
      break;
    }

    // Check months
    if (mes === null) {
      months.forEach((m, idx) => {
        if (rowString.includes(m)) {
          mes = idx + 1;
        }
      });
    }

    // Check year
    if (ano === null) {
      const yearMatch = rowString.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        ano = parseInt(yearMatch[1]);
      }
    }

    if (mes !== null && ano !== null) break;
  }

  return { mes, ano };
};

export const normalizeName = (name: string): string => {
  if (!name) return '';
  // Remover código antes dos dois pontos (ex: "2345: NOME" -> "NOME")
  let clean = name;
  if (name.includes(':')) {
    const parts = name.split(':');
    // Pega a última parte que não seja vazia (lidando com casos como "123: (DECLARADO):")
    clean = parts.filter(p => p.trim().length > 0).pop() || '';
  }
  
  return clean
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, '') // Remove pontuação restante
    .trim()
    .replace(/\s+/g, ' '); // Remove espaços extras
};

export const getCIDChapter = (code: string): string => {
  if (!code || code === 'N/I') return 'Não Identificado';
  
  const letter = code.charAt(0).toUpperCase();
  const num = parseInt(code.substring(1, 3));

  if (isNaN(num)) return 'Outros';

  if (letter === 'A' || letter === 'B') return 'Doenças Infecciosas e Parasitárias';
  if (letter === 'C' || (letter === 'D' && num <= 48)) return 'Neoplasias (Tumores)';
  if (letter === 'D' && num >= 50) return 'D. Sangue e Órgãos Hematopoiéticos';
  if (letter === 'E') return 'D. Endócrinas, Nutricionais e Metabólicas';
  if (letter === 'F') return 'Transtornos Mentais e Comportamentais';
  if (letter === 'G') return 'Doenças do Sistema Nervoso';
  if (letter === 'H' && num <= 59) return 'Doenças do Olho e Anexos';
  if (letter === 'H' && num >= 60) return 'Doenças do Ouvido';
  if (letter === 'I') return 'Doenças do Sistema Circulatório';
  if (letter === 'J') return 'Doenças do Sistema Respiratório';
  if (letter === 'K') return 'Doenças do Sistema Digestivo';
  if (letter === 'L') return 'Doenças da Pele';
  if (letter === 'M') return 'D. Sistema Osteomuscular';
  if (letter === 'N') return 'Doenças do Sistema Geniturinário';
  if (letter === 'O') return 'Gravidez, Parto e Puerpério';
  if (letter === 'P') return 'Afecções Perinatais';
  if (letter === 'Q') return 'Malformações Congênitas';
  if (letter === 'R') return 'Sintomas e Achados Sinais Clínicos';
  if (letter === 'S' || letter === 'T') return 'Lesões e Envenenamentos';
  if (letter >= 'V' && letter <= 'Y') return 'Causas Externas';
  if (letter === 'Z') return 'Contatos com Serviços de Saúde';
  
  return 'Outros/Especiais';
};

export const processCID = (rawCid: any): { code: string; description: string; chapter: string } => {
  if (rawCid === undefined || rawCid === null) return { code: 'N/I', description: 'Não Identificado', chapter: 'Não Identificado' };
  
  const normalized = String(rawCid).trim();
  if (
    normalized === '' || 
    normalized.toLowerCase() === 'ni' || 
    normalized.toLowerCase().includes('não identificado') ||
    normalized.toLowerCase().includes('nao identificado') ||
    normalized.toLowerCase() === 'n/a' ||
    normalized === '-' ||
    normalized === '.'
  ) {
    return { code: 'N/I', description: 'Não Identificado', chapter: 'Não Identificado' };
  }

  // Tenta capturar o padrão CID (Letra + 2 ou 3 números)
  const cidRegex = /([A-Z][0-9]{2,3}(?:\.[0-9A-Z]{1,2})?)/i;
  const match = normalized.match(cidRegex);
  
  let code = 'N/I';
  let description = normalized;

  if (match) {
    code = match[1].trim().toUpperCase();
    
    let rest = normalized;
    const parts = normalized.split(match[1]);
    if (parts.length > 1) {
      rest = parts.slice(1).join(match[1]).trim();
      description = rest.replace(/^[\s\-\:\.]+/ , '').trim();
    }
    
    if (!description && parts[0].trim()) {
      description = parts[0].replace(/[\s\-\:\.]+$/ , '').trim();
    }
  } else {
    // Fallback para códigos curtos (ex: Z001)
    const fallbackRegex = /([A-Z][0-9]{3})/i;
    const fbMatch = normalized.match(fallbackRegex);
    if (fbMatch) {
      code = fbMatch[1].toUpperCase();
    }
  }

  if (!description || description === code) {
    description = 'Diagnóstico não especificado';
  }

  return { 
    code, 
    description,
    chapter: getCIDChapter(code)
  };
};

/**
 * Validates if a string follows the CID-10 standard pattern:
 * A letter followed by 2 or 3 numbers, optionally followed by a decimal point and more digits/letters.
 * Examples: A00, B10.5, Z01.1
 */
export const extractHospitalSummaryData = (allRows: any[][], fileName: string): { unidade: string | null; mes: number | null; ano: number | null; totalAtendimentos: number | null } => {
  const fileNameUpper = fileName.toUpperCase();
  
  // 1. IDENTIFICAR UNIDADE
  let unidade: string | null = null;
  if (fileNameUpper.includes("CS24")) unidade = "CS24";
  else if (fileNameUpper.includes("CSI")) unidade = "CSI";
  else if (fileNameUpper.includes("UPA")) unidade = "UPA";

  // 2. IDENTIFICAR DATA (Mês e Ano)
  const extrairData = (texto: string) => {
    const meses: Record<string, number> = {
      JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, MARÇO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
      JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12
    };

    const textoUpper = texto.toUpperCase();
    let mes: number | null = null;
    let ano: number | null = null;

    Object.keys(meses).forEach(m => {
      if (textoUpper.includes(m)) {
        mes = meses[m];
      }
    });

    // Match year (2020-2029)
    const matchAno = textoUpper.match(/202\d/);
    if (matchAno) ano = parseInt(matchAno[0]);
    
    // Match direct MM/YYYY format
    const matchDataFull = textoUpper.match(/(\d{2})[\/\-](202\d)/);
    if (matchDataFull) {
      mes = parseInt(matchDataFull[1]);
      ano = parseInt(matchDataFull[2]);
    }

    return { mes, ano };
  };

  // Check filename first for date
  let { mes, ano } = extrairData(fileName);

  // 3. IDENTIFICAR "QUANTIDADE DE ATENDIMENTOS" e data no conteúdo
  let totalAtendimentos: number | null = null;
  let maxNumberFound: number | null = null;

  allRows.forEach(linha => {
    if (!Array.isArray(linha)) return;
    
    linha.forEach((celula, index) => {
      // Data discovery in content if not found in filename
      if ((mes === null || ano === null) && typeof celula === "string") {
        const contentDate = extrairData(celula);
        if (mes === null) mes = contentDate.mes;
        if (ano === null) ano = contentDate.ano;
      }

      // Atendimentos discovery
      if (typeof celula === "string") {
        const texto = celula.toLowerCase();
        if (
          texto.includes("quantidade de atendimentos") ||
          texto.includes("total de atendimentos") ||
          texto.includes("atendimentos realizados")
        ) {
          // Look at the next few cells or the one exactly after
          const nextValues = [linha[index + 1], linha[index + 2], linha[index + 3]];
          for (const val of nextValues) {
            if (typeof val === "number" && val > 0) {
              totalAtendimentos = val;
              break;
            }
          }
        }
      }

      // Track Max Number for Fallback (avoid huge numbers like IDs or small numbers like days)
      if (typeof celula === "number") {
        // Assume total of monthly hospital visits is usually between 100 and 50000 
        // to avoid picking up years (2026) or IDs
        if (celula > 50 && celula < 100000 && celula !== ano) {
          if (maxNumberFound === null || celula > maxNumberFound) {
            maxNumberFound = celula;
          }
        }
      }
    });
  });

  // 4. FALLBACK: Se não encontrou pelo texto, usa o maior número da planilha
  if (totalAtendimentos === null) {
    totalAtendimentos = maxNumberFound;
  }

  console.log("Processando Relatório Hospitalar:");
  console.log("Unidade:", unidade);
  console.log("Data:", `${mes}/${ano}`);
  console.log("Total atendimentos:", totalAtendimentos);

  return { unidade, mes, ano, totalAtendimentos };
};

/**
 * Validates if a string follows the CID-10 standard pattern:
 * A letter followed by 2 or 3 numbers, optionally followed by a decimal point and more digits/letters.
 * Examples: A00, B10.5, Z01.1
 */
export const isValidCID = (cid: string | null | undefined): boolean => {
  if (!cid) return false;
  const normalized = cid.trim().toUpperCase();
  // Standard CID-10 regex: 1 letter + 2 or 3 digits + optional . + optional 1 or 2 chars
  const cidRegex = /^[A-Z][0-9]{2,3}(?:\.[0-9A-Z]{1,2})?$/;
  return cidRegex.test(normalized);
};
