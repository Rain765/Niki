import type { PresentationSlide } from '@open-design/contracts';
import { SelectField } from '../components/SelectField';

export function PresentationEvidenceEditor({
  slide,
  onChange,
}: {
  slide: PresentationSlide;
  onChange: (s: PresentationSlide) => void;
}) {
  return (
    <>
      {slide.table && (
        <section className="ppt-evidence-editor">
          <h3>表格内容</h3>
          <div className="ppt-evidence-editor__table">
            <table>
              <thead>
                <tr>
                  {slide.table.headers.map((value, col) => (
                    <th key={col}>
                      <input
                        aria-label={`第 ${col + 1} 列标题`}
                        value={value}
                        onChange={(e) =>
                          onChange({
                            ...slide,
                            table: {
                              ...slide.table!,
                              headers: slide.table!.headers.map((v, i) =>
                                i === col ? e.target.value : v,
                              ),
                            },
                          })
                        }
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slide.table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((value, col) => (
                      <td key={col}>
                        <textarea
                          aria-label={`第 ${i + 1} 行第 ${col + 1} 列`}
                          value={value}
                          onChange={(e) =>
                            onChange({
                              ...slide,
                              table: {
                                ...slide.table!,
                                rows: slide.table!.rows.map((r, ri) =>
                                  ri === i
                                    ? r.map((v, ci) =>
                                        ci === col ? e.target.value : v,
                                      )
                                    : r,
                                ),
                              },
                            })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {slide.chart && (
        <section className="ppt-evidence-editor">
          <h3>图表数据</h3>
          <label>
            单位与口径
            <input
              value={slide.chart.unit}
              onChange={(e) =>
                onChange({
                  ...slide,
                  chart: { ...slide.chart!, unit: e.target.value },
                })
              }
            />
          </label>
          {slide.chart.labels.map((label, i) => (
            <div className="ppt-evidence-editor__row" key={i}>
              <input
                aria-label={`数据 ${i + 1} 标签`}
                value={label}
                onChange={(e) =>
                  onChange({
                    ...slide,
                    chart: {
                      ...slide.chart!,
                      labels: slide.chart!.labels.map((v, j) =>
                        j === i ? e.target.value : v,
                      ),
                    },
                  })
                }
              />
              <input
                aria-label={`数据 ${i + 1} 数值`}
                type="number"
                value={slide.chart!.values[i]}
                onChange={(e) =>
                  onChange({
                    ...slide,
                    chart: {
                      ...slide.chart!,
                      values: slide.chart!.values.map((v, j) =>
                        j === i ? Number(e.target.value) : v,
                      ),
                    },
                  })
                }
              />
            </div>
          ))}
        </section>
      )}
      {!!slide.groups?.length && (
        <section className="ppt-evidence-editor">
          <h3>图形分组</h3>
          {slide.groups.map((g, i) => (
            <label key={g.id}>
              分组 {i + 1}
              <input
                value={g.title}
                onChange={(e) =>
                  onChange({
                    ...slide,
                    groups: slide.groups!.map((v, j) =>
                      j === i ? { ...v, title: e.target.value } : v,
                    ),
                  })
                }
              />
            </label>
          ))}
          {slide.items.map((item, i) => (
            <SelectField
              key={item.id}
              label={item.title}
              value={item.group ?? ''}
              options={[
                { value: '', label: '首个分组' },
                ...slide.groups!.map((g) => ({ value: g.id, label: g.title })),
              ]}
              onChange={(group) =>
                onChange({
                  ...slide,
                  items: slide.items.map((v, j) =>
                    i === j ? { ...v, group } : v,
                  ),
                })
              }
            />
          ))}
        </section>
      )}
      {slide.image && (
        <label>
          图片说明
          <textarea
            value={slide.image.caption}
            onChange={(e) =>
              onChange({
                ...slide,
                image: { ...slide.image!, caption: e.target.value },
              })
            }
          />
        </label>
      )}
    </>
  );
}
