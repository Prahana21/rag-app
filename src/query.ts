
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv"
import { GoogleGenerativeAI } from "@google/generative-ai"
dotenv.config();


const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
});
const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);

const genAI = new GoogleGenerativeAI( process.env.GEMINI_API_KEY!)
//embedding the question so that we can search pinecone and find similar chunks that already exist
async function embedQuestion(question: string): Promise<number[]> {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: { parts: [{ text: question }] }
            })
        }
    );
    const data = await response.json() as any;
    if (!data.embedding?.values) {
        throw new Error("Failed to get embedding: " + JSON.stringify(data));
    }
    return data.embedding.values;
}
async function searchPinecone(fileName: string, userId: string, questionVector: number[], topK: number = 3): Promise<string[]> {
    let results = await index.query({
        vector: questionVector,
        topK: topK,
        //searches only chunks from specific pdf
        includeMetadata: true,//very important since this tells pinecone to send that metadata with the results without it we would only get Ids and scores not the actual text
        filter: { fileName: { $eq: fileName }, userId: { $eq: userId } },
    });
    let answer: string[] = results.matches
        .map(match => match.metadata?.text as string)
        .filter(text => text !== undefined && text !== "");
    //.map() → extracts the text from each match, filter() → removes any undefined or empty strings as string → tells TypeScript this is a string
    return answer;
}
async function askGemini(question: string, answer: string[], history: { role: string, content: string }[], onChunk: (text: string) => void): Promise<void> {
    const prompt = `
You are an intelligent assistant helping a user understand a document.
You are given relevant excerpts from the document and a question.

Your job is to REASON from the context to answer the question — 
not just find exact word matches. Think carefully step by step if needed.

Rules:
- Use ONLY the provided context to form your answer
- If the question requires reasoning or inference from the context, do it!
- If the answer truly cannot be derived from the context, say 
  "I cannot find enough information in the document to answer this."
- Never make up facts that aren't supported by the context
- Be concise but thorough

Context:
${answer.join("\n\n")}

Question: ${question}

Answer:`
    //convert history to gemini format
    const geminiHistory = history.map(msg => ({
        role: msg.role === "assistant" ? "model": "user",
        parts: [{ text: msg.content }]
    }))
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});
    const chat = model.startChat({
        history: geminiHistory
    });
    // stream instead of generate
    const result = await chat.sendMessageStream(prompt);
    for await (const chunk of result.stream){
        const text = chunk.text()
        if (text) onChunk(text.replace(/\*+/g, ""))// call callback with each peice
    }
}

export async function queryPDF(fileName: string, question: string, topK: number, history: {role: string, content: string}[], userId: string, onChunk: (text: string) => void): Promise<void>{
    const question_vector: number[] = await embedQuestion(question);
    const chunks_array = await searchPinecone(fileName, userId, question_vector, topK);
    await askGemini(question, chunks_array, history, onChunk);
}   

