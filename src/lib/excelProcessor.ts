/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { FileType } from '../types';

export const identifyFileType = (headers: string[], fileName?: string): FileType => {
  const normalized = headers.map(h => h.toLowerCase().trim());
  const normalizedString = normalized.join(' ');
  const fn = fileName?.toLowerCase() || '';
  
  // 1. Content-based detection (Priority)
  // Atestados
  if (
    (normalized.some(h => h.includes('paciente')) && normalized.some(h => h.includes('tipo de documento'))) || 
    normalizedString.includes('atestado médico')
  ) return 'Atestados';

  // Exames
  if (
    normalized.some(h => h.includes('procedimento')) ||
    normalized.some(h => h.includes('exame')) ||
    normalized.some(h => h.includes('qtd'))
  ) return 'Exames';

  // CIDs
  if (
    normalized.some(h => h.includes('cid')) || 
    (normalized.some(h => h.includes('paciente')) && normalized.some(h => h.includes('pront')))
  ) return 'CIDs';
  
  // Atendimentos
  if (
    normalized.some(h => h.includes('quantidade')) || 
    normalizedString.includes('atendimento')
  ) return 'Atendimentos';

  // 2. Filename-based detection (Fallback)
  if (fn.includes('atestado')) return 'Atestados';
  if (fn.includes('exame')) return 'Exames';
  if (fn.includes('cid')) return 'CIDs';
  if (fn.includes('atendimento') || fn.includes('producao') || fn.includes('produção')) return 'Atendimentos';

  return 'Unknown';
};

export const identifyUnit = (filename: string, data: any[]): string | null => {
  const units = ['CS24', 'CSI', 'UPA'];
  const normalizedFilename = filename.toUpperCase();
  
  // 1. Check filename
  for (const unit of units) {
    if (normalizedFilename.includes(unit)) return unit;
  }

  // 2. Check content (headers or first few rows)
  if (data.length > 0) {
    const firstRowText = JSON.stringify(data[0]).toUpperCase();
    for (const unit of units) {
      if (firstRowText.includes(unit)) return unit;
    }
  }

  return null;
};

export const parseExcelFile = async (file: File): Promise<{ type: FileType; data: any[]; identifiedUnit: string | null; meta: { mes: number | null; ano: number | null } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (!result) {
          resolve({ type: 'Unknown', data: [], identifiedUnit: null, meta: { mes: null, ano: null } });
          return;
        }

        const arrayBuffer = result as ArrayBuffer;
        
        let workbook;
        const readOptions: XLSX.ParsingOptions = {
          cellDates: true,
          cellNF: false,
          cellText: false,
          cellStyles: false,
          bookVBA: false,
          bookProps: false,
          cellFormula: false,
          codepage: 65001,
          dense: false,
          WTF: true
        };

        try {
          // Attempt 1: Raw array read
          workbook = XLSX.read(arrayBuffer, { ...readOptions, type: 'array' });
        } catch (readErr: any) {
          console.warn("Standard array read failed, trying recovery modes...", readErr);
          
          try {
             // Attempt 2: Binary string fallback (resilient to certain ZIP headers)
             const bytes = new Uint8Array(arrayBuffer);
             let binary = "";
             for (let i = 0; i < bytes.length; i += 8192) {
               binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
             }
             
             workbook = XLSX.read(binary, { 
               ...readOptions,
               type: 'binary'
             });
          } catch (fallbackErr: any) {
             console.error("Fallback read failed:", fallbackErr);
             
             try {
                // Attempt 3: Try reading as string (Mistaken extension?)
                const decoder = new TextDecoder('utf-8');
                const text = decoder.decode(arrayBuffer);
                workbook = XLSX.read(text, { ...readOptions, type: 'string' });
             } catch (finalErr) {
                // Attempt 4: Last resort - try with codepage if it's a legacy file
                try {
                   const bytes = new Uint8Array(arrayBuffer);
                   workbook = XLSX.read(bytes, { ...readOptions, type: 'buffer' });
                } catch (ultraFinalErr) {
                   throw new Error(`Arquivo Excel não reconhecido ou corrompido. Dica: Abra o arquivo no Excel e salve novamente como '.xlsx' (Pasta de Trabalho do Excel).`);
                }
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
          'PRONTUARIO', 'NOME', 'DESCRICAO'
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
        
        resolve({ type, data: jsonData, identifiedUnit, meta: { mes: fileMes, ano: fileAno } });
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
