import type { Response } from 'express';

type IcsDisposition = 'attachment' | 'inline';

export function sendIcs(res: Response, body: string, filename: string, disposition: IcsDisposition = 'attachment'): void {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(body);
}

export function sendPrivateIcs(res: Response, body: string, filename: string): void {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(body);
}
