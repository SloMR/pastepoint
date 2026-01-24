import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filesize',
  standalone: true,
})
export class FileSizePipe implements PipeTransform {
  transform(bytes: number | null | undefined, fractionDigits: number = 2): string {
    const value = typeof bytes === 'number' && isFinite(bytes) && bytes >= 0 ? bytes : 0;
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;
    const TB = GB * 1024;

    if (value < KB) {
      return `${Math.round(value)} B`;
    }
    if (value < MB) {
      return `${(value / KB).toFixed(fractionDigits)} KB`;
    }
    if (value < GB) {
      return `${(value / MB).toFixed(fractionDigits)} MB`;
    }
    if (value < TB) {
      return `${(value / GB).toFixed(fractionDigits)} GB`;
    }
    return `${(value / TB).toFixed(fractionDigits)} TB`;
  }
}
