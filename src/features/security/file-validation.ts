export class FileValidationError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

export interface SpreadsheetValidationOptions {
  maxBytes?: number;
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
}

const DEFAULT_EXTENSIONS = ["xlsx", "xls", "csv"];
const DEFAULT_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  "application/octet-stream",
  "",
];

export function validateSpreadsheetFile(file: File, options: SpreadsheetValidationOptions = {}): void {
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const extensions = options.allowedExtensions ?? DEFAULT_EXTENSIONS;
  const mimeTypes = options.allowedMimeTypes ?? DEFAULT_MIME_TYPES;
  const fileName = file.name || "";
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "";
  if (!extension || !extensions.includes(extension)) {
    throw new FileValidationError("SPREADSHEET_UNSUPPORTED_EXTENSION", "仅支持 xlsx、xls 或 csv 文件。");
  }
  if (file.size <= 0) {
    throw new FileValidationError("SPREADSHEET_EMPTY_FILE", "文件为空，请重新上传。");
  }
  if (file.size > maxBytes) {
    throw new FileValidationError("SPREADSHEET_FILE_TOO_LARGE", `文件过大，最大支持 ${Math.round(maxBytes / 1024 / 1024)}MB。`);
  }
  if (!mimeTypes.includes(file.type)) {
    throw new FileValidationError("SPREADSHEET_UNSUPPORTED_MIME", "文件类型不在允许范围内。");
  }
}
