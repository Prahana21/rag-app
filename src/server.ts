import express from "express";// creates our web server
import cors from "cors";// allow frontend to talk to backend
import multer from "multer";// save uploaded pdf to disc
import dotenv from "dotenv";// loads api keys from .env
import path from "path";// handles file paths across OS 
import fs from "fs";//reads/ deletes files from disc
import { ingestPDF } from "./ingest";//our pdf ingestion pipeline
import { queryPDF } from "./query";//our question answering pipeline
import mongoose from "mongoose";
import authRouter from "./auth";
import { authMiddleware, AuthRequest } from "./middleware";


dotenv.config()
const app = express();
app.use(express.static(path.join(__dirname, "../client/dist")));
mongoose.connect(process.env.MONGODB_URI!)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err));
app.use(cors());
app.use(express.json())
app.use("/auth", authRouter);
//creating the uploads folder
const uploadDir = "uploads";//variable storing the folder name
if (!fs.existsSync(uploadDir)){
    //if the uploads folder doesn't exist on the disk, create it
    fs.mkdirSync(uploadDir);
}
//configuring multer storage, just like a rulebook or instructions
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);//saves the uploaded file to "uploads/" folder, cb means callback
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
        //with timestamps every file gets a unique name, no overwriting
    }
})
const upload = multer({ storage });// creates the upload middleware using our storage config
// when the user hits `POST/upload`, -> upload.single("pdf") runs first -> reads the incoming file from the request
//->saves it to uploads/ folder using our storage cofig -> attaches file info to req.file -> passes control to next function
// the /upload route needs to return fileName in the response
app.post("/upload", authMiddleware, upload.single("pdf"), async (req: AuthRequest, res) => {
    try {
        if (!req.file || req.file.mimetype !== "application/pdf") return res.status(400).json({ error: "Please upload a valid pdf" });
        const filePath = req.file.path;
        //frontend recieves the filename and stores it-uses it in every question followed
        const fileName = await ingestPDF(filePath, req.file.mimetype, req.userId!);
        fs.unlinkSync(filePath);
        return res.status(200).json({ fileName });
    } catch (error) {
        //if ingestPDF throws an error halfway through, then the file still exists on the disk
        // delete file if it exists before sending error
        console.error("Ingestion error:", error); // ← add this line!
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: "something went wrong"});

    }
    
})
app.post("/ask", authMiddleware, async (req: AuthRequest, res)=>{
    try {
        if (!req.body.question) return res.status(400).json({error: "Please provide a question"});
        const question = req.body.question;
        if (!req.body.fileName) return res.status(400).json({ error: "fileName not found"})
        const fileName = req.body.fileName;
        const topK = req.body.topK || 3;
        const history = req.body.history || [];// default emoty array for the first message with no history
        
        //SSE headers - tells browser "this is a stream"
        res.setHeader("Content-Type", "text/event-stream") // tells browser expect a stream not regular JSON
        res.setHeader("Cache-Control", "no-cache") // don't cache streaming data
        res.setHeader("Connection", "keep-alive")//keep connection open until we call res.end()
        await queryPDF(fileName, question, topK, history, req.userId!, (text) => {
            res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`)
        })

        res.write(`data: [DONE]\n\n`)
        res.end()
    }catch (error){
        console.error("Query error:", error); 
        res.write(`data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`)
        res.end()
    }
    

})
//if multer crashes (file too large) -> express sees error, skips all natural routes -> jumps straight to error handler middleware -> sends proper error response to user
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    res.status(500).json({ error: "Something went wrong!" });
});
app.use((req, res) => {
    res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
//We made fileName flow through the entire pipeline — from upload response → frontend → query request → Pinecone filter — so each question only searches the relevant PDF!
