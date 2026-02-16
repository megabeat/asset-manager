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
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr className="ui-table-head-row">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`ui-table-th ${
                  column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="ui-table-row-even">
              <td colSpan={columns.length} className="ui-table-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowKey(row)} className={rowIndex % 2 === 0 ? 'ui-table-row-even' : 'ui-table-row-odd'}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`ui-table-td ${
                      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
