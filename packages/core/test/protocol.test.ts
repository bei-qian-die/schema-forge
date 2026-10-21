import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  compileExpression,
  compileSchema,
  deepClone,
  defaultValueForType,
  deletePath,
  flattenValues,
  getPath,
  isEmpty,
  migrateSchema,
  parsePath,
  propsFields,
  registerMaterials,
  registerRuleValidator,
  clearMaterialRegistry,
  listMaterials,
  runSyncRule,
  setPath,
  type FieldNode,
  type InferFormData,
} from '../src'

describe('path helpers', () => {
  it('parses dotted and bracketed paths', () => {
    expect(parsePath('company.taxNo')).toEqual(['company', 'taxNo'])
    expect(parsePath('items[0].price')).toEqual(['items', 0, 'price'])
    expect(parsePath('items["a.b"].value')).toEqual(['items', 'a.b', 'value'])
  })

  it('prefers an exact flat key over an equivalent nested path', () => {
    const data = { 'company.taxNo': 'FLAT', company: { taxNo: 'NESTED' } }
    expect(getPath(data, 'company.taxNo')).toBe('FLAT')
    setPath(data, 'company.taxNo', 'NEXT')
    expect(data['company.taxNo']).toBe('NEXT')
    expect(data.company.taxNo).toBe('NESTED')
  })

  it('creates nested containers on set and removes them on delete', () => {
    const data: Record<string, unknown> = {}
    setPath(data, 'a.b.c', 1)
    setPath(data, 'items[0].name', 'first')
    expect(data).toEqual({ a: { b: { c: 1 } }, items: [{ name: 'first' }] } as never)
    deletePath(data, 'a.b.c')
    expect(getPath(data, 'a.b.c')).toBeUndefined()
  })

  it('clones, flattens and checks emptiness', () => {
    const source = { a: { b: 1, list: [1, 2] }, c: '' }
    const copy = deepClone(source)
    expect(copy).toEqual(source)
    expect(copy.a).not.toBe(source.a)
    expect(flattenValues({ a: { b: 1 }, c: 'x' })).toEqual({ 'a.b': 1, c: 'x' })
    expect(isEmpty('   ')).toBe(true)
    expect(isEmpty([])).toBe(true)
    expect(isEmpty(0)).toBe(false)
  })
})

describe('schema migration', () => {
  it('migrates 1.0 visibleWhen / requiredWhen / rule.when to expressions', () => {
    const result = migrateSchema({
      version: '1.0',
      id: 'legacy',
      fields: [
        {
          key: 'taxNo',
          type: 'input',
          visibleWhen: { field: 'invoice.type', eq: 'COMPANY' },
          requiredWhen: { field: 'invoice.type', in: ['COMPANY', 'GOV'] },
          rules: [{ kind: 'pattern', when: { field: 'mode', eq: 'strict' }, pattern: '^\\d+$' }],
        },
      ],
    })

    expect(result.applied).toEqual(['1.0 → 1.1', '1.1 → 2.0'])
    expect(result.schema.version).toBe('2.0')
    expect(result.schema.layout).toEqual({ type: 'grid', columns: 12, gutter: 16 })
    const field = result.schema.fields[0]!
    expect(field.visible).toBe("$form.invoice.type === \"COMPANY\"")
    expect(field.required).toContain("$form.invoice.type === \"COMPANY\"")
    expect(field.required).toContain("$form.invoice.type === \"GOV\"")
    expect(field.rules?.[0]?.when).toBe("$form.mode === \"strict\"")
    expect((field as unknown as Record<string, unknown>).visibleWhen).toBeUndefined()
  })

  it('leaves v2 schemas untouched', () => {
    const input = {
      version: '2.0',
      id: 'current',
      fields: [{ key: 'a', type: 'input', visible: '$form.b === 1' }],
    }
    const result = migrateSchema(input)
    expect(result.applied).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.schema.fields).toEqual(input.fields)
  })

  it('warns when the schema version is newer than the engine', () => {
    const result = migrateSchema({ version: '9.0', id: 'future', fields: [] })
    expect(result.warnings[0]).toContain('高于引擎支持版本')
  })

  it('rejects malformed input', () => {
    expect(() => migrateSchema(null)).toThrowError('Schema 必须是对象')
    expect(() => migrateSchema({ fields: 'nope' })).toThrowError('Schema.fields 必须是数组')
  })
})

describe('materials and bootstrap property schema', () => {
  it('registers, groups and resolves defaults', () => {
    clearMaterialRegistry()
    registerMaterials([
      {
        type: 'input',
        title: '单行文本',
        group: '基础',
        valueType: 'string',
        defaultValue: '',
        propsSchema: { fields: [{ key: 'placeholder', type: 'input', label: '占位符' }] },
      },
      {
        type: 'number',
        title: '数字输入',
        group: '基础',
        valueType: 'number',
        defaultProps: { step: 1 },
      },
    ])
    expect(listMaterials()).toHaveLength(2)
    expect(defaultValueForType('input')).toBe('')
    expect(defaultValueForType('number')).toBeUndefined()
    expect(propsFields(listMaterials()[0])).toHaveLength(1)
    clearMaterialRegistry()
  })
})

describe('validation registry', () => {
  it('runs custom sync rules', () => {
    registerRuleValidator('even', ({ value }) =>
      Number(value) % 2 === 0 ? true : '必须是偶数',
    )
    const message = runSyncRule({
      key: 'count',
      value: 3,
      values: {},
      status: { visible: true, disabled: false, required: false },
      rule: { kind: 'custom', name: 'even', message: '必须是偶数' },
    })
    expect(message).toBe('必须是偶数')
  })
})

describe('compiler output', () => {
  it('reports stats, hash and field kinds', () => {
    const program = compileSchema({
      version: '2.0',
      id: 'stats',
      fields: [
        { key: 'company.name', type: 'input', label: 'Name' },
        { key: 'company.taxNo', type: 'input', label: 'Tax', visible: '$form.mode === 1' },
      ],
    })
    expect(program.stats.fieldCount).toBe(2)
    expect(program.stats.expressionCount).toBe(1)
    expect(program.stats.schemaHash).toMatch(/^[0-9a-f]{7}$/)
    expect(program.stats.compileMs).toBeGreaterThanOrEqual(0)
    expect(program.order).toContain('company.taxNo.visible')
  })
})

describe('InferFormData', () => {
  it('maps schema keys to nested data types', () => {
    const schema = {
      version: '2.0',
      id: 'typed',
      fields: [
        { key: 'company.taxNo', type: 'input' },
        { key: 'amount', type: 'number' },
        { key: 'agree', type: 'switch' },
        { key: 'items', type: 'array' },
      ],
    } as const
    type Data = InferFormData<typeof schema>
    expectTypeOf<Data>().toEqualTypeOf<{
      company: { taxNo: string }
      amount: number
      agree: boolean
      items: unknown[]
    }>()
    const data: Data = {
      company: { taxNo: '91360100MA1234567X' },
      amount: 128,
      agree: true,
      items: [],
    }
    expect(data.company.taxNo).toContain('9136')
  })
})

describe('expression compilation for rules', () => {
  it('keeps rule when expressions compiled', () => {
    const compiled = compileExpression('$form.mode === 1')
    expect(compiled.deps).toEqual(['mode'])
  })
})

describe('container layout', () => {
  it('flags layouts and keeps children addressable', () => {
    const program = compileSchema({
      version: '2.0',
      id: 'layout',
      fields: [
        {
          key: 'section',
          type: 'card',
          label: 'Section',
          children: [
            { key: 'nested.value', type: 'input', label: 'Nested' } satisfies FieldNode,
          ],
        },
      ],
    })
    expect(program.fieldMap.get('section')?.isContainer).toBe(true)
    expect(program.fieldMap.get('nested.value')?.isDataField).toBe(true)
  })
})
