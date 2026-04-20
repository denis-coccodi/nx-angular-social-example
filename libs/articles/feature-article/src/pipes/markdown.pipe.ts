import { inject, Pipe, PipeTransform, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';

@Pipe({
  name: 'markdown',
  standalone: true,
})
export class MarkdownPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(content: string | null): string {
    if (!content) return '';

    const dirtyHtml = marked.parse(content, {
      mangle: false,
      headerIds: false,
    }) as string;

    return this.sanitizer.sanitize(SecurityContext.HTML, dirtyHtml) || '';
  }
}
