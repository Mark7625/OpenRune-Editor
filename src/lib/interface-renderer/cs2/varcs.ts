export class Varcs {
  private readonly map = new Map<number, unknown>();

  getInt(var1: number): number {
    const v = this.map.get(var1);
    return typeof v === "number" && Number.isFinite(v) ? v : -1;
  }

  setInt(var1: number, var2: number): void {
    this.map.set(var1, var2);
  }

  getString(var1: number): string {
    const v = this.map.get(var1);
    return typeof v === "string" ? v : "";
  }

  setString(var1: number, var2: string): void {
    this.map.set(var1, var2);
  }
}
