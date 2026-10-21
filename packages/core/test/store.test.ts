import { describe, expect, it, vi } from 'vitest'
import { compileSchema, createForm, deepClone, type FormSchema } from '../src'

const invoiceSchema = (): FormSchema => ({
  version: '2.0',
  id: 'invoice',
  title: '开票申请',
  fields: [
    {
      key: 'invoice.type',
      type: 'select',
      label: '发票类型',
      defaultValue: 'PERSONAL',
      props: { options: ['PERSONAL', 'COMPANY'] },
    },
    { key: 'amount', type: 'number', label: '开票金额', defaultValue: 0 },
    {
      key: 'company.name',
      type: 'input',
      label: '单位名称',
      defaultValue: '',
      rules: [{ kind: 'required', message: '请填写单位名称' }],
    },
    {
      key: 'company.taxNo',
      type: 'input',
      label: '纳税人识别号',
      visible: "$form.invoice.type === 'COMPANY'",
      required: "$form.invoice.type === 'COMPANY'",
      rules: [
        {
          kind: 'pattern',
          pattern: '^[0-9A-Z]{15,20}$',
          message: '税号需为 15–20 位大写字母或数字',
        },
      ],
    },
    {
      key: 'bank.name',
      type: 'input',
      label: '开户行',
      visible: "$status.company.taxNo.visible && $form.amount > 0",
    },
  ],
})

describe('createForm initialization', () => {
  it('compiles the invoice schema and starts in PERSONAL mode', () => {
    const form = createForm(invoiceSchema())
    expect(form.program.stats.fieldCount).toBe(5)
    expect(form.program.cycles).toEqual([])
    expect(form.getValue('invoice.type')).toBe('PERSONAL')
    expect(form.isVisible('company.taxNo')).toBe(false)
    expect(form.isVisible('bank.name')).toBe(false)
    expect(form.getStatus('company.taxNo').required).toBe(false)
  })

  it('seeds values from nested and flat input', () => {
    const form = createForm(invoiceSchema(), {
      initialValues: {
        amount: 128,
        'company.taxNo': '91360100MA1234567X',
        company: { name: '成都某某科技有限公司' },
      },
    })
    expect(form.getValue('amount')).toBe(128)
    expect(form.getValue('company.taxNo')).toBe('91360100MA1234567X')
    expect(form.getValue('company.name')).toBe('成都某某科技有限公司')
  })
})

describe('precise propagation', () => {
  it('recomputes only the downstream effects when a source changes', () => {
    const form = createForm(invoiceSchema())
    const before = form.getVersion('company.name')
    const result = form.setValue('invoice.type', 'COMPANY')

    expect(form.isVisible('company.taxNo')).toBe(true)
    expect(form.getStatus('company.taxNo').required).toBe(true)
    expect(result.evaluated.map((effect) => effect.id)).toEqual([
      'company.taxNo.visible',
      'company.taxNo.required',
      'bank.name.visible',
    ])
    expect(result.evaluated.filter((effect) => effect.order === undefined)).toHaveLength(0)
    expect(result.touched).toContain('company.taxNo')
    expect(result.touched).not.toContain('company.name')
    expect(form.getVersion('company.name')).toBe(before)
  })

  it('propagates effect → effect chains through $status', () => {
    const form = createForm(invoiceSchema())
    form.setValue('invoice.type', 'COMPANY')
    expect(form.isVisible('bank.name')).toBe(false)

    const result = form.setValue('amount', 100)
    expect(result.evaluated.map((effect) => effect.id)).toContain('bank.name.visible')
    expect(form.isVisible('bank.name')).toBe(true)
  })

  it('evaluates effects in topological order', () => {
    const form = createForm(invoiceSchema())
    const result = form.setValue('invoice.type', 'COMPANY')
    const orders = result.evaluated.map((effect) => effect.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('treats $self as a dependency of its own field', () => {
    const form = createForm({
      version: '2.0',
      id: 'self',
      fields: [
        { key: 'budget', type: 'number', label: '预算', defaultValue: 0, disabled: '$self > 10' },
      ],
    })
    expect(form.getStatus('budget').disabled).toBe(false)
    form.setValue('budget', 12)
    expect(form.getStatus('budget').disabled).toBe(true)
    form.setValue('budget', 3)
    expect(form.getStatus('budget').disabled).toBe(false)
  })

  it('does nothing when the value is unchanged', () => {
    const form = createForm(invoiceSchema())
    const result = form.setValue('amount', 0)
    expect(result.touched).toEqual([])
    expect(result.evaluated).toEqual([])
  })
})

describe('validation', () => {
  it('runs required and pattern rules and exposes an error tree', async () => {
    const form = createForm(invoiceSchema())
    form.setValue('invoice.type', 'COMPANY')
    form.setValue('amount', 100)

    await form.validateField('company.taxNo')
    expect(form.getErrors('company.taxNo')[0]).toContain('纳税人识别号')

    form.setValue('company.taxNo', 'bad-tax')
    await form.validateField('company.taxNo')
    expect(form.getErrors('company.taxNo')).toEqual(['税号需为 15–20 位大写字母或数字'])

    form.setValue('company.taxNo', '91360100MA1234567X')
    await form.validateField('company.taxNo')
    expect(form.getErrors('company.taxNo')).toEqual([])
    expect(form.getErrorTree()).toEqual({})
  })

  it('re-validates errored fields after their value changes', async () => {
    const form = createForm(invoiceSchema())
    await form.validateField('company.name')
    expect(form.getErrors('company.name')).toEqual(['请填写单位名称'])

    form.setValue('company.name', '成都某某科技有限公司')
    expect(form.getErrors('company.name')).toEqual([])
  })

  it('clears hidden fields from the error tree during full validation', async () => {
    const form = createForm(invoiceSchema())
    await form.validate()
    expect(form.getErrors('company.name')).toEqual(['请填写单位名称'])

    form.setValue('invoice.type', 'COMPANY')
    await form.validateField('company.taxNo')
    expect(form.getErrors('company.taxNo')).toHaveLength(1)
    form.setValue('invoice.type', 'PERSONAL')
    await form.validate()
    expect(form.getErrors('company.taxNo')).toEqual([])
  })

  it('debounces async validators and exposes their errors', async () => {
    const asyncValidator = vi.fn(async (context: { value: unknown }) =>
      context.value === 'USED' ? '该税号已被占用' : true,
    )
    const schema = invoiceSchema()
    const taxField = schema.fields.find((field) => field.key === 'company.taxNo')!
    taxField.rules = [...(taxField.rules ?? []), { kind: 'async-remote', message: '远程校验失败' }]

    const form = createForm(schema, {
      validateOn: 'input',
      asyncDebounce: 5,
      asyncValidator,
    })
    form.setValue('invoice.type', 'COMPANY')
    form.setValue('company.taxNo', 'USED')
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(asyncValidator).toHaveBeenCalled()
    expect(form.getErrors('company.taxNo')).toContain('该税号已被占用')
    expect(form.getStats().asyncScheduled).toBeGreaterThan(0)
  })
})

describe('serialization, reset and events', () => {
  it('serializes visible values only and keeps hidden values in the store', () => {
    const form = createForm(invoiceSchema(), {
      initialValues: { company: { name: 'ACME', taxNo: 'SECRET' } },
    })
    expect(form.serialize()).not.toHaveProperty('company.taxNo')
    expect(form.serialize({ includeHidden: true })).toHaveProperty('company.taxNo', 'SECRET')
    expect(form.getValue('company.taxNo')).toBe('SECRET')
  })

  it('emits one event per set with the affected fields', () => {
    const onEvent = vi.fn()
    const form = createForm(invoiceSchema(), { onEvent })
    form.setValue('invoice.type', 'COMPANY')
    expect(onEvent).toHaveBeenCalledTimes(1)
    const event = onEvent.mock.calls[0]?.[0]
    expect(event.type).toBe('set')
    expect(event.path).toBe('invoice.type')
    expect(event.evaluated.length).toBe(3)
    expect(event.revision).toBeGreaterThan(0)
  })

  it('supports unsubscribe', () => {
    const form = createForm(invoiceSchema())
    const listener = vi.fn()
    const off = form.subscribe(listener)
    form.setValue('amount', 5)
    off()
    form.setValue('amount', 6)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('resets to schema defaults', () => {
    const form = createForm(invoiceSchema())
    form.setValue('invoice.type', 'COMPANY')
    form.setValue('amount', 888)
    form.reset()
    expect(form.getValue('invoice.type')).toBe('PERSONAL')
    expect(form.getValue('amount')).toBe(0)
    expect(form.isVisible('company.taxNo')).toBe(false)
    expect(form.getStats().revision).toBeGreaterThan(0)
  })
})

describe('compile diagnostics', () => {
  it('reports expression errors with line and column', () => {
    const program = compileSchema({
      version: '2.0',
      id: 'broken',
      fields: [{ key: 'a', type: 'input', label: 'A', visible: '$form.' }],
    })
    const error = program.issues.find((issue) => issue.severity === 'error')
    expect(program.issues.some((issue) => issue.code === 'PARSE' || issue.code === 'LEX')).toBe(true)
    expect(error?.fieldKey).toBe('a')
    expect(typeof error?.line).toBe('number')
  })

  it('detects cyclic effect dependencies and prints the path', () => {
    const program = compileSchema({
      version: '2.0',
      id: 'cycle',
      fields: [
        { key: 'a', type: 'input', label: 'A', visible: '$status.b.visible' },
        { key: 'b', type: 'input', label: 'B', visible: '$status.a.visible' },
      ],
    })
    expect(program.cycles).toHaveLength(1)
    expect(program.cyclic.length).toBeGreaterThanOrEqual(2)
    expect(program.issues.some((issue) => issue.code === 'CIRCULAR_DEPENDENCY')).toBe(true)
  })

  it('renames duplicate keys and keeps container children', () => {
    const program = compileSchema({
      version: '2.0',
      id: 'dup',
      fields: [
        { key: 'same', type: 'input', label: 'One' },
        { key: 'same', type: 'input', label: 'Two' },
        {
          key: 'group',
          type: 'card',
          label: 'Group',
          children: [{ key: 'inner', type: 'input', label: 'Inner' }],
        },
      ],
    })
    expect(program.allFields.map((field) => field.key)).toEqual(['same', 'same_2', 'group', 'inner'])
    expect(program.issues.some((issue) => issue.code === 'DUPLICATE_KEY')).toBe(true)
    expect(program.allFields.find((field) => field.key === 'group')?.isDataField).toBe(false)
  })
})

describe('deepClone', () => {
  it('clones proxy-wrapped schema nodes instead of throwing', () => {
    const raw = { label: '金额', props: { min: 0 }, children: [{ key: 'inner' }] }
    const proxied = new Proxy(raw, {})
    expect(() => structuredClone(proxied)).toThrow()
    const copy = deepClone(proxied)
    expect(copy).toEqual(raw)
    expect(copy).not.toBe(raw)
  })
})
