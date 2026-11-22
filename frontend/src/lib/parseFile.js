// Turns an uploaded .csv or .xlsx File into sheets of rows for previewing.
// Every result has the same shape: [{ name, rows: [[cell, ...], ...] }].
import Papa from "papaparse";
import readExcelFile from "read-excel-file/browser";

export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx"];
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function getExtension(fileName) {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (result) => resolve([{ name: "CSV", rows: result.data }]),
      error: reject,
    });
  });
}

async function parseXlsx(file) {
  const sheets = await readExcelFile(file);
  return sheets.map((s) => ({ name: s.sheet, rows: s.data }));
}

export function parseFile(file) {
  return getExtension(file.name) === ".csv" ? parseCsv(file) : parseXlsx(file);
}
