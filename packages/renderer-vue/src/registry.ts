import type { Component } from 'vue'

const components = new Map<string, Component>()

export function registerFieldComponent(type: string, component: Component): void {
  components.set(type, component)
}

export function registerFieldComponents(map: Record<string, Component>): void {
  for (const [type, component] of Object.entries(map)) registerFieldComponent(type, component)
}

export function getFieldComponent(type: string): Component | undefined {
  return components.get(type)
}

export function listFieldComponents(): string[] {
  return [...components.keys()]
}
