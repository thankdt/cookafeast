declare module 'lunar-javascript' {
  interface LunarObj {
    getDay(): number;
    getMonth(): number;
    getYearInGanZhi(): string;
  }
  interface SolarObj {
    getLunar(): LunarObj;
  }
  export const Solar: {
    fromYmd(year: number, month: number, day: number): SolarObj;
  };
}

declare module 'qrcode-terminal' {
  interface Options {
    small?: boolean;
  }
  export function generate(text: string, options?: Options, cb?: (qr: string) => void): void;
  export function generate(text: string, cb: (qr: string) => void): void;
  const _default: { generate: typeof generate };
  export default _default;
}
