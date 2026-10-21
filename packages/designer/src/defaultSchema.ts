import type { FormSchema } from '@schema-forge/core'

export const DEMO_VALUES: Record<string, unknown> = {
  'invoice.type': 'COMPANY',
  'company.name': '成都某某科技有限公司',
  amount: 128000,
  'invoice.date': '2026-10-21',
  items: [{ product: '技术咨询服务', quantity: 2, price: 64000, taxRate: '6%' }],
  remark: '合同编号 HT-2026-1021，请按月结方式开具。',
}

export function createDefaultSchema(): FormSchema {
  return {
    version: '2.0',
    id: 'invoice-apply',
    title: '企业开票申请',
    description: '一张演示 Schema：包含嵌套路径、联动表达式、$status 间接依赖、数组容器与校验规则。',
    layout: { type: 'grid', columns: 12, gutter: 16 },
    fields: [
      {
        key: 'invoice.type',
        type: 'select',
        label: '发票类型',
        layout: { colSpan: 6 },
        required: true,
        props: {
          options: [
            { label: '个人 / 事业单位', value: 'PERSONAL' },
            { label: '增值税专用发票（企业）', value: 'COMPANY' },
          ],
          placeholder: '请选择发票类型',
        },
        rules: [{ kind: 'required', message: '请选择发票类型' }],
      },
      {
        key: 'company.name',
        type: 'input',
        label: '企业名称',
        layout: { colSpan: 6 },
        required: true,
        props: { placeholder: '请输入营业执照上的企业全称', help: '异步校验：输入“已存在”可触发远程规则' },
        rules: [
          { kind: 'required', message: '请输入企业名称' },
          {
            kind: 'async-remote',
            message: '远程校验：该企业名称已被占用（演示）',
            when: "includes($form.company.name, '已存在')",
          },
        ],
      },
      {
        key: 'company.taxNo',
        type: 'input',
        label: '纳税人识别号',
        layout: { colSpan: 6 },
        visible: "$form.invoice.type === 'COMPANY'",
        required: "$form.invoice.type === 'COMPANY'",
        props: { placeholder: '15 / 18 / 20 位数字或大写字母', mono: true, suffix: 'TAX' },
        rules: [
          { kind: 'pattern', value: '^[0-9A-Z]{15,20}$', message: '税号需为 15–20 位数字或大写字母' },
        ],
      },
      {
        key: 'amount',
        type: 'number',
        label: '开票金额（元）',
        layout: { colSpan: 6 },
        required: true,
        props: { placeholder: '0.00', prefix: '¥', min: 0, step: 100 },
        rules: [
          { kind: 'required', message: '请输入开票金额' },
          { kind: 'range', min: 0, max: 10000000, message: '金额需在 0 – 10,000,000 之间' },
        ],
      },
      {
        key: 'bank.name',
        type: 'input',
        label: '开户银行',
        layout: { colSpan: 6 },
        visible: "$form.invoice.type === 'COMPANY' && $form.amount > 0",
        props: { placeholder: '仅企业专用发票需要填写' },
      },
      {
        key: 'bank.branch',
        type: 'input',
        label: '开户支行',
        layout: { colSpan: 6 },
        visible: "$status.bank.name.visible && $form.amount > 0",
        required: '$status.bank.name.visible',
        props: { placeholder: '依赖 $status：开户银行可见后才出现' },
      },
      {
        key: 'invoice.date',
        type: 'date',
        label: '开票日期',
        layout: { colSpan: 6 },
        required: true,
      },
      {
        key: 'items',
        type: 'array',
        label: '发票明细',
        layout: { colSpan: 12 },
        children: [
          {
            key: 'product',
            type: 'input',
            label: '商品名称',
            layout: { colSpan: 5 },
            required: true,
            props: { placeholder: '服务 / 商品名称' },
          },
          {
            key: 'quantity',
            type: 'number',
            label: '数量',
            layout: { colSpan: 2 },
            required: true,
            props: { min: 1, step: 1 },
          },
          {
            key: 'price',
            type: 'number',
            label: '单价',
            layout: { colSpan: 2 },
            props: { prefix: '¥', min: 0 },
          },
          {
            key: 'taxRate',
            type: 'select',
            label: '税率',
            layout: { colSpan: 3 },
            props: {
              options: [
                { label: '6%', value: '6%' },
                { label: '9%', value: '9%' },
                { label: '13%', value: '13%' },
                { label: '免税', value: '0%' },
              ],
              placeholder: '税率',
            },
          },
        ],
      },
      {
        key: 'remark',
        type: 'textarea',
        label: '备注',
        layout: { colSpan: 12 },
        props: { placeholder: '选填，500 字以内', rows: 3, maxLength: 500 },
      },
      {
        key: 'agreement',
        type: 'switch',
        label: '已阅读开票须知',
        layout: { colSpan: 12 },
        required: '$form.amount > 100000',
        props: { activeText: '已确认', inactiveText: '未确认' },
        rules: [{ kind: 'required', message: '大额开票需确认开票须知' }],
      },
    ],
  }
}
