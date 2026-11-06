// imapflow ships types.d.ts but doesn't reference it from package.json; declare the subset we use.
declare module 'imapflow' {
  import { EventEmitter } from 'node:events';
  export interface ImapFlowOptions {
    host: string;
    port: number;
    secure?: boolean;
    auth: { user: string; pass: string };
    logger?: false | object;
    socketTimeout?: number;
    greetingTimeout?: number;
    connectionTimeout?: number;
  }
  export interface MailboxLock {
    path: string;
    release(): void;
  }
  export class ImapFlow extends EventEmitter {
    constructor(options: ImapFlowOptions);
    mailbox: false | { path: string; uidNext: number; exists: number };
    connect(): Promise<void>;
    logout(): Promise<void>;
    close(): void;
    getMailboxLock(path: string, options?: { readOnly?: boolean }): Promise<MailboxLock>;
    fetchAll(
      range: string,
      query: { uid?: boolean; size?: boolean; source?: boolean; envelope?: boolean },
      options?: { uid?: boolean },
    ): Promise<{ uid: number; size?: number; source?: Buffer }[]>;
  }
}
