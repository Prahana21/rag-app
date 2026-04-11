declare module "pdf-poppler" {
    export function convert(file: string, options: any): Promise<void>;
}
