
// Hàm chia đoạn thông minh: Tách theo câu để tua chính xác hơn
export function splitChapterIntoChunks(text: string): string[] {
    if (!text || text.trim().length === 0) return [];
    const matches = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g);
    if (!matches) return [text];
    const chunks: string[] = [];
    let currentChunk = "";
    const MIN_CHUNK_LENGTH = 300; 
    for (const sentence of matches) {
        currentChunk += sentence;
        if (currentChunk.length >= MIN_CHUNK_LENGTH) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }
    }
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}
