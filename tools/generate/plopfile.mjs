import fs from 'fs'
import YAML from 'yaml'
import { paramCase as kebab, pascalCase as pascal } from 'change-case'

export default function (plop) {
  plop.setHelper('kebabCase', kebab)
  plop.setHelper('properCase', pascal)

  // ---- Nuxt Page
  plop.setGenerator('nuxt:page', {
    description: 'Scaffold a Nuxt page with dashboard layout',
    prompts: [{ type: 'input', name: 'name', message: 'Entity name (e.g., Users):' }],
    actions: (data) => ([
      {
        type: 'add',
        path: 'modules/ui/app/pages/{{kebabCase name}}/index.vue',
        templateFile: 'agent/coding-assistant/templates/nuxt/page.vue.hbs',
        abortOnFail: true
      },
      {
        type: 'add',
        path: 'docs/{{kebabCase name}}.md',
        templateFile: 'agent/coding-assistant/templates/docs/stub.md.hbs',
        abortOnFail: false
      },
      // Optional: register a reusable component name if you want
      // { type: 'modify', path: 'agent/coding-assistant/registries/components.yml', transform: appendComponent(data) }
    ])
  })

  // ---- CLI Command
  plop.setGenerator('cli:command', {
    description: 'Scaffold a CLI command and register it',
    prompts: [
      { type: 'input', name: 'name', message: 'Command id (kebab-case):' },
      { type: 'input', name: 'desc', message: 'Description:' }
    ],
    actions: (data) => ([
      {
        type: 'add',
        path: 'cli/src/commands/{{kebabCase name}}.ts',
        templateFile: 'agent/coding-assistant/templates/cli/command.ts.hbs',
        abortOnFail: true
      },
      {
        type: 'modify',
        path: 'agent/coding-assistant/registries/cli.yml',
        transform: (src) => {
          const y = YAML.parse(src || 'commands: []')
          y.commands = y.commands || []
          if (y.commands.find(c => c.id === kebab(data.name))) {
            throw new Error(`CLI id already exists: ${kebab(data.name)}`)
          }
          y.commands.push({
            id: kebab(data.name),
            file: `cli/src/commands/${kebab(data.name)}.ts`,
            desc: data.desc || '',
            status: 'draft'
          })
          return YAML.stringify(y)
        }
      }
    ])
  })

  // ---- Test Spec
  plop.setGenerator('test:spec', {
    description: 'Scaffold a standard Vitest spec (happy path + edge case)',
    prompts: [
      { type: 'input', name: 'name', message: 'Spec name (kebab-case):' },
      { type: 'input', name: 'area', message: 'Area (api|cli|core|utils|examples):', default: 'examples' }
    ],
    actions: () => ([
      {
        type: 'add',
        path: 'tests/{{area}}/{{kebabCase name}}.spec.ts',
        templateFile: 'agent/coding-assistant/templates/tests/spec.ts.hbs',
        abortOnFail: true
      }
    ])
  })
}