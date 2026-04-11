import { chunkText } from "../ingest";

test("should return a single chunk for short text", () => {
    // ARRANGE
    const shortText = "word ".repeat(100); // 100 words, well under 500

    // ACT
    const result = chunkText(shortText);

    // ASSERT
    expect(result).toHaveLength(1);
});

test("should split long text into multiple chunks", () => {
    // ARRANGE
    const longText = "word ".repeat(1000); // 1000 words

    // ACT
    const result = chunkText(longText, 500, 50);

    // ASSERT
    expect(result.length).toBeGreaterThan(1);
});

test("should not return empty chunks", () => {
    // ARRANGE
    const text = "word ".repeat(600);

    // ACT
    const result = chunkText(text, 500, 50);

    // ASSERT
    result.forEach(chunk => {
        expect(chunk.trim()).not.toBe("");
    });
});

test("should respect the chunkSize", () => {
    // ARRANGE
    const text = "word ".repeat(600);

    // ACT
    const result = chunkText(text, 500, 50);

    // ASSERT
    result.forEach(chunk => {
        const wordCount = chunk.split(" ").filter(w => w !== "").length;
        expect(wordCount).toBeLessThanOrEqual(500);
    });
});
