import type { FieldNode } from './schema'

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never

type ValueOfType<T extends string> = T extends 'number'
  ? number
  : T extends 'switch'
    ? boolean
    : T extends 'array'
      ? unknown[]
      : T extends 'object'
        ? Record<string, unknown>
        : string

type PathObject<Path extends string, Value> = Path extends `${infer Head}.${infer Rest}`
  ? { [K in Head]: PathObject<Rest, Value> }
  : { [K in Path]: Value }

type FieldData<Node> = Node extends {
  key: infer Key extends string
  type: infer Type extends string
}
  ? Type extends 'grid' | 'card' | 'tabs' | 'tab' | 'collapse'
    ? Node extends { children: readonly (infer Child)[] }
      ? FieldData<Child>
      : {}
    : PathObject<Key, ValueOfType<Type>>
  : {}

type AllFieldData<Node> = Node extends { children: readonly (infer Child)[] }
  ? FieldData<Node> | AllFieldData<Child>
  : FieldData<Node>

type Simplify<T> = { [K in keyof T]: T[K] } & {}

/**
 * Schema → data type. Works with a schema declared `as const`:
 *
 *   const schema = { fields: [{ key: 'company.taxNo', type: 'input' }] } as const
 *   type Data = InferFormData<typeof schema> // { company: { taxNo: string } }
 */
export type InferFormData<S> = S extends { fields: readonly (infer Node)[] }
  ? Simplify<UnionToIntersection<AllFieldData<Node>>>
  : Record<string, unknown>

export type InferFieldValue<Node extends FieldNode> = ValueOfType<Node['type']>
