import type { sheets_v4 } from 'googleapis';

const rgb = (red: number, green: number, blue: number) => ({ red: red / 255, green: green / 255, blue: blue / 255 });
const blue = rgb(38, 70, 143);
const white = rgb(255, 255, 255);
const cyan = rgb(109, 207, 227);
const ink = rgb(23, 43, 77);
const line = rgb(223, 231, 239);

export const REPORT_HEADER_ROWS = 2;

export function reportLayout(sheetId: number, endRow: number): sheets_v4.Schema$Request[] {
  const range = (startRowIndex: number, endRowIndex: number, startColumnIndex = 0, endColumnIndex = 8) =>
    ({ sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex });
  const format = (area: sheets_v4.Schema$GridRange, userEnteredFormat: sheets_v4.Schema$CellFormat) => ({
    repeatCell: { range: area, cell: { userEnteredFormat }, fields: 'userEnteredFormat' },
  });
  const size = (dimension: string, startIndex: number, endIndex: number, pixelSize: number) => ({
    updateDimensionProperties: { range: { sheetId, dimension, startIndex, endIndex }, properties: { pixelSize }, fields: 'pixelSize' },
  });
  const requests: sheets_v4.Schema$Request[] = [{
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: REPORT_HEADER_ROWS, hideGridlines: true } },
      fields: 'gridProperties.frozenRowCount,gridProperties.hideGridlines',
    },
  }];
  for (const [start, end] of [[0, 4], [4, 8]] as const) {
    const area = range(0, 1, start, end);
    requests.push(
      { mergeCells: { range: area, mergeType: 'MERGE_ROWS' } },
      format(area, {
        backgroundColor: blue, verticalAlignment: 'MIDDLE', horizontalAlignment: start === 0 ? 'LEFT' : 'RIGHT',
        textFormat: { foregroundColor: white, bold: true, fontSize: start === 0 ? 12 : 10 },
        padding: { left: 8, right: 8, top: 2, bottom: 2 },
        borders: { bottom: { style: 'SOLID', color: cyan } },
      }),
    );
  }
  requests.push(size('ROWS', 0, 1, 30), size('ROWS', 1, 2, 28));
  const widths = [48, 160, 220, 85, 260, 180, 120, 105];
  widths.forEach((width, column) => {
    const horizontalAlignment = column === 7 ? 'RIGHT' : column === 0 || column === 6 ? 'CENTER' : 'LEFT';
    const common = { horizontalAlignment, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
      padding: { left: 6, right: 6, top: 4, bottom: 4 }, borders: { bottom: { style: 'SOLID', color: line } } };
    requests.push(size('COLUMNS', column, column + 1, width),
      format(range(1, 2, column, column + 1), { ...common, textFormat: { bold: true, foregroundColor: blue, fontSize: 10 } }));
    if (endRow > REPORT_HEADER_ROWS) {
      requests.push(format(range(REPORT_HEADER_ROWS, endRow, column, column + 1), {
        ...common, textFormat: { foregroundColor: ink, fontSize: 10 },
      }));
    }
  });
  if (endRow > REPORT_HEADER_ROWS) {
    requests.push({ autoResizeDimensions: { dimensions: { sheetId, dimension: 'ROWS', startIndex: REPORT_HEADER_ROWS, endIndex: endRow } } });
  }
  return requests;
}
