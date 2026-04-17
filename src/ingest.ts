import fs from "fs";
import path from "path"

import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv"
import { GoogleGenerativeAI } from "@google/generative-ai";
import PDFParser from "pdf2json";
import { execSync } from "child_process";

dotenv.config();//loads .env file

// Intialize clients

const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
});// creates a connection to our Pinecone database
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
async function extractTextFromPDF(filePath: string, mimeType: string): Promise<string> {
    // Validation
    if (!filePath.toLowerCase().endsWith(".pdf") || mimeType !== "application/pdf") {
        throw new Error("Invalid file! Please upload a valid PDF document.");
    }

    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();

        pdfParser.on("pdfParser_dataError", (err: any) => {
            reject(new Error("Could not parse PDF: " + err.parserError));
        });

        pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
            try {
                // Extract text directly from pdfData pages
                const text = pdfData.Pages?.map((page: any) =>
                    page.Texts?.map((t: any) =>
                        decodeURIComponent(t.R?.map((r: any) => r.T).join(""))
                    ).join(" ")
                ).join("\n") || "";

                console.log("Extracted text length:", text.length);
                console.log("Sample:", text.substring(0, 100));

                if (!text || text.trim() === "") {
                    console.log("pdf2json found no text, attempting OCR...");
                    extractTextWithOCR(filePath)
                        .then(ocrText => resolve(ocrText))
                        .catch(err => reject(err));
                    return;
                }
                resolve(text);
            } catch (err) {
                console.log("pdf2json traversal failed, attempting OCR...");
                extractTextWithOCR(filePath)
                   .then(ocrText => resolve(ocrText))
                   .catch(ocrErr => reject(ocrErr));
            }
        });

        pdfParser.loadPDF(filePath);
    });
}
export function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
    let words: string[] = text.split(" ");
    let chunks: string[] = [];
    //Overlap makes sure important sentences that fall at boundaries never get cut off from their context
    for (let i = 0; i < words.length; i += chunkSize-overlap){
        let chunkWords: string[] = words.slice(i, i+chunkSize);
        chunks.push(chunkWords.join(" "));
    }
    return chunks;
}



async function extractTextWithOCR(filePath: string): Promise<string> {
    // Step 1: Convert PDF to images
    
    // Step 2: Find generated images
    const prefix = path.basename(filePath, ".pdf");
    execSync(`pdftoppm -png "${filePath}" "uploads/${prefix}"`);
    const files = fs.readdirSync("uploads")
        .filter(f => f.startsWith(prefix) && f.endsWith(".png"))
        .sort()
        .map(f => path.join("uploads", f));

    if (files.length === 0) throw new Error("Could not convert PDF to images");

    // Step 3: Send each image to Gemini and extract text
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    let fullText = "";

    for (const file of files) {
        const imageData = fs.readFileSync(file).toString("base64");
        const result = await model.generateContent([
            {
                inlineData: {
                    data: imageData,
                    mimeType: "image/png"
                }
            },
            "Extract all the text from this image exactly as it appears. Return only the text, nothing else."
        ]);
        fullText += result.response.text() + "\n";
        fs.unlinkSync(file); // delete image after reading
    }

    if (!fullText.trim()) throw new Error("Could not extract any text from PDF");
    return fullText;
}

async function getEmbedding(text: string): Promise<number[]> {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,

        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: { parts: [{ text }] }
            })
        }
    );
    const data = await response.json() as any;
    if (!data.embedding?.values) {
        throw new Error("Failed to get embedding: " + JSON.stringify(data));
    }
    return data.embedding.values;
}
async function embedAndStore(chunks: string[], fileName: string, userId: string): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
        const vector = await getEmbedding(chunks[i]);

        await index.upsert({
            records: [{
                id: `${fileName}-chunk-${i}`,
                values: vector,
                metadata: {
                    text: chunks[i],
                    fileName: fileName,
                    userId: userId
                }
            }]
        });

        console.log(`Stored chunk ${i + 1}/${chunks.length}`);
    }
}
export async function ingestPDF(filePath: string, mimeType: string, userId: string): Promise<string> {
    const fileName = path.basename(filePath)
    console.log(`starting ingestion for: ${fileName}`)

    const data = await extractTextFromPDF(filePath, mimeType);
    console.log(`extracted ${data.length} characters`)

    const chunks = chunkText(data)
    console.log(`Split into ${chunks.length} chunks`);

    await embedAndStore(chunks, fileName, userId)
    console.log(`Ingestion done for ${fileName}`)
    return fileName;//now tells the caller what the file name was since the frontend needs to know filename so it can send it back when asking questions
}
