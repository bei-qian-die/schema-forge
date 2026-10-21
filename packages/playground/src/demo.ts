import type { FormSchema } from '@schema-forge/core'

/**
 * The runtime demo used by the landing page. Every number shown next to it is
 * produced by compiling this schema with @schema-forge/core at page load.
 */
export const demoSchema: FormSchema = {
  version: '2.0',
  id: 'travel-request',
  title: '差旅申请',
  description:
    '一张覆盖嵌套路径、三级 $status 联动、条件必填与异步校验的演示 Schema。',
  layout: { type: 'grid', columns: 12, gutter: 16 },
  fields: [
    {
      key: 'section.applicant',
      type: 'card',
      label: '申请人',
      layout: { colSpan: 12 },
      props: { title: '申请人', description: '基础信息用于审批路由与差旅标准匹配。' },
      children: [
        {
          key: 'employee.name',
          type: 'input',
          label: '申请人姓名',
          layout: { colSpan: 4 },
          required: true,
          defaultValue: '林知远',
          props: {
            placeholder: '请输入真实姓名',
            help: '输入「重名」可触发 480ms 的异步远程校验。',
          },
          rules: [
            { kind: 'len', min: 2, max: 20, message: '姓名长度需在 2 – 20 个字符之间' },
            {
              kind: 'async-remote',
              message: '远程校验：该姓名与在职员工冲突（演示）',
              when: "includes($form.employee.name, '重名')",
            },
          ],
        },
        {
          key: 'employee.department',
          type: 'select',
          label: '所属部门',
          layout: { colSpan: 4 },
          required: true,
          defaultValue: 'product',
          props: {
            placeholder: '请选择部门',
            options: [
              { label: '产品设计部', value: 'product' },
              { label: '平台研发部', value: 'engineering' },
              { label: '客户成功部', value: 'success' },
              { label: '市场增长部', value: 'growth' },
            ],
          },
          rules: [{ kind: 'required', message: '请选择所属部门' }],
        },
        {
          key: 'employee.level',
          type: 'select',
          label: '职级',
          layout: { colSpan: 4 },
          defaultValue: 'P6',
          props: {
            options: ['P5', 'P6', 'P7', 'P8'].map((level) => ({
              label: level,
              value: level,
            })),
          },
        },
      ],
    },
    {
      key: 'section.trip',
      type: 'card',
      label: '行程与合规',
      layout: { colSpan: 12 },
      props: {
        title: '行程与合规',
        description: '切换「国内 / 国际」会驱动 8 条可见性与必填联动。',
      },
      children: [
        {
          key: 'trip.type',
          type: 'radio',
          label: '差旅类型',
          layout: { colSpan: 12 },
          required: true,
          defaultValue: 'DOMESTIC',
          props: {
            options: [
              { label: '国内差旅', value: 'DOMESTIC' },
              { label: '国际 / 港澳台', value: 'INTERNATIONAL' },
            ],
          },
        },
        {
          key: 'trip.city',
          type: 'input',
          label: '目的城市',
          layout: { colSpan: 6 },
          defaultValue: '杭州',
          visible: "$form.trip.type === 'DOMESTIC'",
          required: "$form.trip.type === 'DOMESTIC'",
          props: { placeholder: '如：杭州、深圳' },
        },
        {
          key: 'trip.country',
          type: 'select',
          label: '国家 / 地区',
          layout: { colSpan: 6 },
          defaultValue: 'SG',
          visible: "$form.trip.type === 'INTERNATIONAL'",
          required: "$form.trip.type === 'INTERNATIONAL'",
          props: {
            placeholder: '请选择目的地',
            options: [
              { label: '新加坡', value: 'SG' },
              { label: '德国', value: 'DE' },
              { label: '日本', value: 'JP' },
              { label: '美国', value: 'US' },
            ],
          },
        },
        {
          key: 'passport.no',
          type: 'input',
          label: '护照号码',
          layout: { colSpan: 6 },
          visible: "$form.trip.type === 'INTERNATIONAL'",
          required: '$status.passport.no.visible',
          props: {
            placeholder: 'E12345678',
            mono: true,
            help: '必填状态由 $status.passport.no.visible 派生。',
          },
          rules: [
            {
              kind: 'pattern',
              value: '^[A-Z0-9]{5,17}$',
              message: '护照号码需为 5 – 17 位大写字母或数字',
            },
          ],
        },
        {
          key: 'passport.expiry',
          type: 'date',
          label: '护照有效期',
          layout: { colSpan: 6 },
          visible: "$form.trip.type === 'INTERNATIONAL'",
          required: '$status.passport.no.required',
          props: { help: '又一条链：required 依赖上游 required 的实际状态。' },
        },
        {
          key: 'travel.from',
          type: 'date',
          label: '出发日期',
          layout: { colSpan: 3 },
          defaultValue: '2026-11-03',
          required: true,
          rules: [{ kind: 'required', message: '请选择出发日期' }],
        },
        {
          key: 'travel.to',
          type: 'date',
          label: '返回日期',
          layout: { colSpan: 3 },
          defaultValue: '2026-11-07',
          required: true,
          rules: [{ kind: 'required', message: '请选择返回日期' }],
        },
        {
          key: 'travel.insurance',
          type: 'switch',
          label: '境外保险',
          layout: { colSpan: 6 },
          defaultValue: true,
          visible: "$form.trip.type === 'INTERNATIONAL'",
          props: { activeText: '已投保', inactiveText: '未投保' },
        },
      ],
    },
    {
      key: 'section.budget',
      type: 'card',
      label: '预算与审批',
      layout: { colSpan: 12 },
      props: {
        title: '预算与审批',
        description: '金额超过 ¥5,000 时自动要求成本中心；紧急申请追加说明。',
      },
      children: [
        {
          key: 'budget.amount',
          type: 'number',
          label: '预算金额（元）',
          layout: { colSpan: 4 },
          defaultValue: 6800,
          required: true,
          props: { prefix: '¥', min: 0, max: 200000, step: 100 },
          rules: [
            { kind: 'required', message: '请输入预算金额' },
            { kind: 'range', min: 0, max: 200000, message: '预算需在 ¥0 – ¥200,000 之间' },
          ],
        },
        {
          key: 'budget.currency',
          type: 'select',
          label: '结算币种',
          layout: { colSpan: 4 },
          defaultValue: 'CNY',
          visible: "$form.trip.type === 'INTERNATIONAL'",
          props: {
            options: [
              { label: '人民币 CNY', value: 'CNY' },
              { label: '美元 USD', value: 'USD' },
              { label: '欧元 EUR', value: 'EUR' },
            ],
          },
        },
        {
          key: 'cost.center',
          type: 'input',
          label: '成本中心',
          layout: { colSpan: 4 },
          defaultValue: 'CC-2041',
          required: '$form.budget.amount > 5000',
          props: { placeholder: 'CC-0000', mono: true, help: '金额 > 5000 时自动变为必填。' },
        },
        {
          key: 'urgent',
          type: 'switch',
          label: '紧急申请',
          layout: { colSpan: 4 },
          defaultValue: false,
          props: { activeText: '紧急', inactiveText: '常规' },
        },
        {
          key: 'approval.reason',
          type: 'textarea',
          label: '紧急说明',
          layout: { colSpan: 8 },
          visible: '$form.urgent === true',
          required: '$form.urgent === true',
          props: { rows: 2, placeholder: '说明紧急原因与期望到场时间' },
        },
        {
          key: 'approval.note',
          type: 'textarea',
          label: '备注',
          layout: { colSpan: 12 },
          defaultValue: '客户现场交付，需携带演示设备。',
          props: { rows: 2, placeholder: '选填，500 字以内', maxLength: 500 },
        },
      ],
    },
  ],
}

export const DEMO_VALUES: Record<string, unknown> = {
  'employee.name': '林知远',
  'employee.department': 'product',
  'employee.level': 'P6',
  'trip.type': 'DOMESTIC',
  'trip.city': '杭州',
  'trip.country': 'SG',
  'passport.no': '',
  'passport.expiry': '',
  'travel.from': '2026-11-03',
  'travel.to': '2026-11-07',
  'travel.insurance': true,
  'budget.amount': 6800,
  'budget.currency': 'CNY',
  'cost.center': 'CC-2041',
  urgent: false,
  'approval.reason': '',
  'approval.note': '客户现场交付，需携带演示设备。',
}

export interface DemoPreset {
  id: string
  label: string
  hint: string
  values: Record<string, unknown>
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'domestic',
    label: '国内差旅',
    hint: '隐藏护照与结算币种',
    values: {
      'trip.type': 'DOMESTIC',
      'trip.city': '杭州',
      'cost.center': 'CC-2041',
      urgent: false,
    },
  },
  {
    id: 'international',
    label: '国际差旅',
    hint: '触发 $status 链式必填',
    values: {
      'trip.type': 'INTERNATIONAL',
      'trip.country': 'SG',
      'passport.no': 'E12345678',
      'passport.expiry': '2031-05-20',
      'travel.insurance': true,
      'budget.currency': 'USD',
    },
  },
  {
    id: 'urgent',
    label: '高额加急',
    hint: '成本中心 + 紧急说明',
    values: {
      'budget.amount': 18800,
      urgent: true,
      'approval.reason': '客户现场故障，需 48 小时内到场处理。',
    },
  },
]
