import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken"
import mongoose from "mongoose"
import dotenv from "dotenv"
const router = express.Router();
dotenv.config();
// User Schema — defines shape of user document in MongoDB
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

const User = mongoose.model("User", userSchema);
// REGISTER
//validate email+password -> check if the user already exists
// hash the password with bcrypt -> save new user to MONGODB + return JWT


router.post("/register", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Step 1: Validate
        if (!email || !password) 
            return res.status(400).json({ error: "Email and password are required" });
        if (password.length < 6) 
            return res.status(400).json({ error: "Password must be at least 6 characters" });

        // Step 2: Check if user exists
        const existing = await User.findOne({ email });
        if (existing) 
            return res.status(400).json({ error: "User already exists" });

        // Step 3: Hash password
        const hashed = await bcrypt.hash(password, 10);

        // Step 4: Save to MongoDB
        const user = await User.create({ email, password: hashed });

        // Step 5: Create JWT and return it
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET!,
            { expiresIn: "7d" }
        );

        return res.status(201).json({ token, email: user.email });

    } catch (error) {
        res.status(500).json({ error: "Something went wrong" });
    }
});
router.post("/login", async(req, res) => {
    try {
        const {email, password} = req.body;
        // validate
        if (!email || !password) 
            return res.status(400).json({ error : "Email and Password are required"})
        // find user if both email and password are provided
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "Invalid credentials" });
        // compare password with the stored hash
        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch)
            return res.status(400).json({ error: "Invalid credentials"})
        // return jwt if the user entered correct email and password
        const token = jwt.sign(
            { userId: user._id},
            process.env.JWT_SECRET!,
            { expiresIn: "7d"}
        );
        return res.status(200).json({ token, email: user.email })
    } catch (error) {
        res.status(500).json({ error: "Something went wrong"})
    }
})
export default router;
