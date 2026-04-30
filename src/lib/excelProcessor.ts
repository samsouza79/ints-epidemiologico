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
        // SMPEP files often start at line 10-15
        let headerRowIndex = -1;
        const headerKeywords = [
          'CID', 'PACIENTE', 'ATEND', 'ATENDIMENTO', 'UNIDADE', 
          'QUANTIDADE', 'PROCEDIMENTO', 'TIPO DE DOCUMENTO', 'QTD.', 'QTD'
        ];
        
        // Search first 100 rows for header AND check for date info in content if missing from filename
        const searchRange = Math.min(allRows.length, 100);
        const headerRowsToSearch = allRows.slice(0, searchRange);
        
        if (fileMes === null || fileAno === null) {
          const contentDate = extractDateFromContent(headerRowsToSearch);
          if (fileMes === null) fileMes = contentDate.mes;
          if (fileAno === null) fileAno = contentDate.ano;
        }

        // Fallback to current date if still missing
        if (fileMes === null) fileMes = new Date().getMonth() + 1;
        if (fileAno === null) fileAno = new Date().getFullYear();

        for (let i = 0; i < headerRowsToSearch.length; i++) {
          const row = (headerRowsToSearch[i] || []).map(cell => String(cell || "").toUpperCase().trim());
          
          // A valid header row should have specific keys and NOT look like a Total/Summary row
          const hasSpecificKey = row.some(cell => ['CID', 'ATEND.', 'PACIENTE', 'QTD.', 'TIPO DE DOCUMENTO', 'NOME DO PACIENTE'].some(k => cell === k || (cell.includes(k) && cell.length < 25)));
          const hasGeneralKey = row.some(cell => headerKeywords.some(key => cell.includes(key)));
          
          const filledCells = row.filter(cell => cell.length > 0).length;
          const isTotalRow = row.some(cell => cell === 'TOTAL' || cell === 'GERAL' || cell.includes('TOTAL DE'));
          
          if ((hasSpecificKey || hasGeneralKey) && filledCells >= 3 && !isTotalRow) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          throw new Error("Cabeçalho não encontrado. O arquivo deve conter colunas como 'CID', 'Paciente' ou 'Atend'.");
        }

        // 4. Extract headers and data
        const rawHeaders = allRows[headerRowIndex].map(h => String(h || "").trim());
        const rawData = allRows.slice(headerRowIndex + 1);
        
        const jsonData = rawData
          .filter(row => row && row.some(cell => String(cell || "").trim().length > 0))
          .map((row, idx) => {
            const obj: any = {};
            rawHeaders.forEach((header, index) => {
              if (header && !header.startsWith('__EMPTY')) {
                obj[header] = row[index] !== undefined ? row[index] : "";
              }
            });
            obj.__rowNum = headerRowIndex + idx + 2; // Keep track for error reporting
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

export const processCID = (rawCid: string): { code: string; description: string } => {
  if (!rawCid) return { code: 'N/A', description: 'N/A' };
  
  // Format typically "R11: Desc" or "R11 - Desc"
  const separators = [':', '-', ' '];
  
  // Check for colon first as it's most common
  if (rawCid.includes(':')) {
    const parts = rawCid.split(':');
    return { code: parts[0].trim(), description: parts.slice(1).join(':').trim() };
  }

  // Fallback regex for "CODE[space]Description" or "CODE-Description"
  const match = rawCid.match(/^([A-Z]\d{2,3})\s*[\-\s]\s*(.*)$/i);
  if (match) {
    return { code: match[1].trim(), description: match[2].trim() };
  }

  return { code: rawCid.trim(), description: '' };
};
