import { registerMaterials, type MaterialSpec } from '@schema-forge/core'
import { registerFieldComponents } from '@schema-forge/renderer-vue'
import InputControl from './controls/InputControl.vue'
import TextareaControl from './controls/TextareaControl.vue'
import NumberControl from './controls/NumberControl.vue'
import SelectControl from './controls/SelectControl.vue'
import DateControl from './controls/DateControl.vue'
import SwitchControl from './controls/SwitchControl.vue'
import RadioControl from './controls/RadioControl.vue'
import CheckboxControl from './controls/CheckboxControl.vue'
import SliderControl from './controls/SliderControl.vue'
import RateControl from './controls/RateControl.vue'
import DividerControl from './controls/DividerControl.vue'
import StaticControl from './controls/StaticControl.vue'

const props = (fields: MaterialSpec['propsSchema']) => fields

/**
 * Built-in material library. `propsSchema` is a real schema: the designer's
 * property panel feeds it straight back into the engine.
 */
export const builtinMaterials: MaterialSpec[] = [
  {
    type: 'input',
    title: '单行文本',
    group: '文本',
    icon: 'Aa',
    description: '姓名、编号、税号等短文本。',
    valueType: 'string',
    defaultValue: '',
    defaultProps: { placeholder: '请输入内容' },
    propsSchema: props({
      fields: [
        { key: 'placeholder', type: 'input', label: '占位提示' },
        { key: 'help', type: 'input', label: '帮助文字' },
        { key: 'prefix', type: 'input', label: '前缀' },
        { key: 'suffix', type: 'input', label: '后缀' },
        { key: 'maxLength', type: 'number', label: '最大长度', props: { min: 0, max: 500 } },
        { key: 'mono', type: 'switch', label: '等宽字体', props: { activeText: 'mono' } },
      ],
    }),
  },
  {
    type: 'textarea',
    title: '多行文本',
    group: '文本',
    icon: '¶',
    description: '备注、说明、地址。',
    valueType: 'string',
    defaultValue: '',
    defaultProps: { placeholder: '请输入内容', rows: 3 },
    propsSchema: props({
      fields: [
        { key: 'placeholder', type: 'input', label: '占位提示' },
        { key: 'help', type: 'input', label: '帮助文字' },
        { key: 'rows', type: 'number', label: '默认行数', props: { min: 2, max: 12 } },
        { key: 'maxLength', type: 'number', label: '最大长度', props: { min: 0 } },
      ],
    }),
  },
  {
    type: 'number',
    title: '数字',
    group: '数值',
    icon: '01',
    description: '金额、数量、比例。',
    valueType: 'number',
    defaultProps: { placeholder: '0', step: 1 },
    propsSchema: props({
      fields: [
        { key: 'placeholder', type: 'input', label: '占位提示' },
        { key: 'prefix', type: 'input', label: '前缀' },
        { key: 'suffix', type: 'input', label: '后缀' },
        { key: 'min', type: 'number', label: '最小值' },
        { key: 'max', type: 'number', label: '最大值' },
        { key: 'step', type: 'number', label: '步长' },
        { key: 'help', type: 'input', label: '帮助文字' },
      ],
    }),
  },
  {
    type: 'select',
    title: '下拉选择',
    group: '选择',
    icon: '⌄',
    description: '枚举值，支持选项文本。',
    valueType: 'string',
    defaultValue: '',
    defaultProps: { placeholder: '请选择', optionsText: '选项 A, 选项 B, 选项 C' },
    propsSchema: props({
      fields: [
        { key: 'placeholder', type: 'input', label: '占位提示' },
        {
          key: 'optionsText',
          type: 'input',
          label: '选项（逗号分隔）',
          props: { placeholder: '选项 A, 选项 B' },
        },
        { key: 'help', type: 'input', label: '帮助文字' },
      ],
    }),
  },
  {
    type: 'radio',
    title: '单选组',
    group: '选择',
    icon: '◉',
    description: '三个以内选项优先使用。',
    valueType: 'string',
    defaultValue: '',
    defaultProps: { optionsText: '选项 A, 选项 B' },
    propsSchema: props({
      fields: [
        { key: 'optionsText', type: 'input', label: '选项（逗号分隔）' },
        { key: 'help', type: 'input', label: '帮助文字' },
      ],
    }),
  },
  {
    type: 'checkbox',
    title: '多选组',
    group: '选择',
    icon: '☑',
    description: '结果为数组。',
    valueType: 'array',
    defaultValue: [],
    defaultProps: { optionsText: '选项 A, 选项 B' },
    propsSchema: props({
      fields: [
        { key: 'optionsText', type: 'input', label: '选项（逗号分隔）' },
        { key: 'help', type: 'input', label: '帮助文字' },
      ],
    }),
  },
  {
    type: 'date',
    title: '日期',
    group: '选择',
    icon: '▤',
    description: '原生日期选择。',
    valueType: 'date',
    defaultValue: '',
    propsSchema: props({
      fields: [
        { key: 'help', type: 'input', label: '帮助文字' },
        { key: 'min', type: 'input', label: '最早日期' },
        { key: 'max', type: 'input', label: '最晚日期' },
      ],
    }),
  },
  {
    type: 'switch',
    title: '开关',
    group: '选择',
    icon: '◐',
    description: '布尔值，常用于协议与状态。',
    valueType: 'boolean',
    defaultValue: false,
    defaultProps: { activeText: '是', inactiveText: '否' },
    propsSchema: props({
      fields: [
        { key: 'activeText', type: 'input', label: '开启文字' },
        { key: 'inactiveText', type: 'input', label: '关闭文字' },
        { key: 'help', type: 'input', label: '帮助文字' },
      ],
    }),
  },
  {
    type: 'slider',
    title: '滑块',
    group: '数值',
    icon: '⇥',
    description: '区间内的数值。',
    valueType: 'number',
    defaultValue: 0,
    defaultProps: { min: 0, max: 100, step: 1 },
    propsSchema: props({
      fields: [
        { key: 'min', type: 'number', label: '最小值' },
        { key: 'max', type: 'number', label: '最大值' },
        { key: 'step', type: 'number', label: '步长' },
        { key: 'suffix', type: 'input', label: '单位' },
      ],
    }),
  },
  {
    type: 'rate',
    title: '评分',
    group: '数值',
    icon: '★',
    description: '星级评分。',
    valueType: 'number',
    defaultValue: 0,
    defaultProps: { max: 5 },
    propsSchema: props({
      fields: [{ key: 'max', type: 'number', label: '星数', props: { min: 1, max: 10 } }],
    }),
  },
  {
    type: 'divider',
    title: '分割线',
    group: '展示',
    icon: '—',
    description: '分组与节奏。',
    valueType: 'any',
    defaultProps: { text: 'SECTION' },
    propsSchema: props({
      fields: [{ key: 'text', type: 'input', label: '标注文字' }],
    }),
  },
  {
    type: 'static',
    title: '说明文字',
    group: '展示',
    icon: '¶',
    description: '不需要填写的提示块。',
    valueType: 'any',
    defaultProps: { text: '在这里写一段说明文字，支持换行。' },
    propsSchema: props({
      fields: [{ key: 'text', type: 'textarea', label: '正文', props: { rows: 4 } }],
    }),
  },
  {
    type: 'card',
    title: '卡片容器',
    group: '布局',
    icon: '▦',
    description: '给字段分组，可嵌套。',
    valueType: 'object',
    acceptsChildren: true,
    defaultProps: { title: '分组标题', description: '' },
    propsSchema: props({
      fields: [
        { key: 'title', type: 'input', label: '卡片标题' },
        { key: 'description', type: 'input', label: '卡片描述' },
      ],
    }),
  },
  {
    type: 'grid',
    title: '栅格容器',
    group: '布局',
    icon: '⊞',
    description: '自定义内部列数。',
    valueType: 'object',
    acceptsChildren: true,
    defaultProps: { columns: 12 },
    propsSchema: props({
      fields: [
        { key: 'columns', type: 'number', label: '内部列数', props: { min: 1, max: 24, step: 1 } },
      ],
    }),
  },
  {
    type: 'tabs',
    title: '标签页',
    group: '布局',
    icon: '⊟',
    description: '把字段分到多个标签下。',
    valueType: 'object',
    acceptsChildren: true,
    defaultProps: {},
  },
  {
    type: 'tab',
    title: '标签页签',
    group: '布局',
    icon: '▭',
    description: '标签页内部的页签。',
    valueType: 'object',
    acceptsChildren: true,
    defaultProps: {},
    propsSchema: props({
      fields: [{ key: 'label', type: 'input', label: '页签标题' }],
    }),
  },
  {
    type: 'collapse',
    title: '折叠面板',
    group: '布局',
    icon: '⌑',
    description: '收纳低频字段。',
    valueType: 'object',
    acceptsChildren: true,
    defaultProps: { title: '更多信息' },
    propsSchema: props({
      fields: [{ key: 'title', type: 'input', label: '面板标题' }],
    }),
  },
  {
    type: 'array',
    title: '数组容器',
    group: '布局',
    icon: '≡',
    description: '可增删的重复行。',
    valueType: 'array',
    acceptsChildren: true,
    defaultProps: {},
  },
]

export function registerBuiltinMaterials(): void {
  registerMaterials(builtinMaterials)
  registerFieldComponents({
    input: InputControl,
    textarea: TextareaControl,
    number: NumberControl,
    select: SelectControl,
    date: DateControl,
    switch: SwitchControl,
    radio: RadioControl,
    checkbox: CheckboxControl,
    slider: SliderControl,
    rate: RateControl,
    divider: DividerControl,
    static: StaticControl,
  })
}

export const builtinMaterialTypes = builtinMaterials.map((material) => material.type)
