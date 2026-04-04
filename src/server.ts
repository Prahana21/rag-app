import express from "express";// creates our web server
import cors from "cors";// allow frontend to talk to backend
import multer from "multer";// save uploaded pdf to disc
import dotenv from "dotenv";// loads api keys from .env
import path from "path";// handles file paths across OS 
import fs from "fs";//reads/ deletes files from disc
import { ingestPDF } from "./ingest";//our pdf ingestion pipeline
import { queryPDF } from "./query";//our question answering pipeline

dotenv.config()
const app = express();
app.use(cors());
app.use(express.json())
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
app.post("/upload", upload.single("pdf"), async (req, res) => {
    try {
        if (!req.file || req.file.mimetype !== "application/pdf") return res.status(400).json({ error: "Please upload a valid pdf" });
        const filePath = req.file.path;
        //frontend recieves the filename and stores it-uses it in every question followed
        const fileName = await ingestPDF(filePath, req.file.mimetype);
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
app.post("/ask", async (req, res)=>{
    try {
        if (!req.body.question) return res.status(400).json({error: "Please provide a question"});
        const question = req.body.question;
        if (!req.body.fileName) return res.status(400).json({ error: "fileName not found"})
        const fileName = req.body.fileName;
        const topK = req.body.topK || 3;
        const history = req.body.history || [];// default emoty array for the first message with no history
        const answer = await queryPDF(fileName, question, topK, history);
        return res.status(200).json({ answer })
    }catch (error){
        console.error("Query error:", error); 
        res.status(500).json({ error: "something went wrong"})
    }
    

})
//if multer crashes (file too large) -> express sees error, skips all natural routes -> jumps straight to error handler middleware -> sends proper error response to user
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    res.status(500).json({ error: "Something went wrong!" });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
//We made fileName flow through the entire pipeline — from upload response → frontend → query request → Pinecone filter — so each question only searches the relevant PDF!
