import { ReactNode } from 'react';

type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
};

export function DataTable<T>({ columns, rows, rowKey, emptyMessage = '데이터가 없습니다.' }: DataTableProps<T>) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#f8fafc' }}>
          {columns.map((column) => (
            <th
              key={column.key}
              style={{
                textAlign: column.align ?? 'left',
                padding: '11px 10px',
                fontSize: 13,
                color: '#334155',
                fontWeight: 700
              }}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} style={{ padding: 16 }}>
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row, rowIndex) => (
            <tr key={rowKey(row)} style={{ background: rowIndex % 2 === 0 ? '#fff' : '#fcfdff' }}>
              {columns.map((column) => (
                <td key={column.key} style={{ padding: '11px 10px', textAlign: column.align ?? 'left' }}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
