/**
 * GetStoredData/SetStoredData. The sim returns "" for a missing key: DataStore.get then fails to parse it and the
 * setting keeps its default. Returning null instead would set every setting to null.
 */
export class FakeStorage {
    public readonly data = new Map<string, string>();

    public reset(): void {
        this.data.clear();
    }

    public install(g: any): void {
        g.GetStoredData = (key: string) => this.data.get(key) ?? '';
        g.SetStoredData = (key: string, value: string) => {
            this.data.set(key, value);
        };
        g.DeleteStoredData = (key: string) => {
            this.data.delete(key);
        };
    }
}
