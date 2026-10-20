declare module "saxen" {
  export class Parser {
    constructor(options: { proxy: true });
    ns(): void;
    on(event: "error", callback: (error: Error) => void): void;
    on(event: "cdata", callback: (text: string) => void): void;
    on(event: "text", callback: (text: string, decodeEntities: (value: string) => string) => void): void;
    on(event: "closeTag", callback: (element: { originalName: string }) => void): void;
    on(event: "openTag", callback: (
      element: { originalName: string; attrs: Record<string, string> },
      decodeEntities: (value: string) => string,
    ) => void): void;
    parse(xml: string): void;
  }
}
