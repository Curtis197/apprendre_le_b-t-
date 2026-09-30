import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { parseMarkdown, type Block, type Inline } from '@/lib/courses/markdown'
import { InterlinearGloss } from './InterlinearGloss'

const LINK_CLASS = 'text-primary underline underline-offset-2'

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={i}>{node.value}</Fragment>
      case 'strong':
        return <strong key={i}>{renderInline(node.children)}</strong>
      case 'em':
        return <em key={i}>{renderInline(node.children)}</em>
      case 'code':
        return (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
            {node.value}
          </code>
        )
      case 'link':
        return node.external ? (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="nofollow ugc noopener noreferrer"
            className={LINK_CLASS}
          >
            {renderInline(node.children)}
          </a>
        ) : (
          <a key={i} href={node.href} className={LINK_CLASS}>
            {renderInline(node.children)}
          </a>
        )
    }
  })
}

function renderLines(lines: Inline[][]): ReactNode {
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderInline(line)}
    </Fragment>
  ))
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4'
      const size = block.level === 2 ? 'text-2xl' : block.level === 3 ? 'text-xl' : 'text-lg'
      return (
        <Tag key={key} className={cn('font-heading font-bold mt-6', size)}>
          {renderInline(block.children)}
        </Tag>
      )
    }
    case 'paragraph':
      return <p key={key}>{renderLines(block.lines)}</p>
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag key={key} className={cn('pl-6 space-y-1', block.ordered ? 'list-decimal' : 'list-disc')}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </Tag>
      )
    }
    case 'quote':
      return (
        <blockquote key={key} className="border-l-4 border-primary pl-4 italic text-muted-foreground">
          {renderLines(block.lines)}
        </blockquote>
      )
    case 'rule':
      return <hr key={key} className="border-border" />
    case 'gloss':
      return (
        <InterlinearGloss
          key={key}
          original={block.original}
          literal={block.literal}
          final={block.translation}
          title={block.title}
          variant="card"
        />
      )
  }
}

export function LessonMarkdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('space-y-4 leading-relaxed', className)}>
      {parseMarkdown(source).map(renderBlock)}
    </div>
  )
}
