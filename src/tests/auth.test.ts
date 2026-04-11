import request from "supertest";
import express from "express";
import mongoose from "mongoose";
import authRouter from "../auth";

// Create a test version of express app
const app = express();
app.use(express.json());
app.use("/auth", authRouter);

// Connect to MongoDB before tests run
beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
}, 30000);

// Clean up test users after all tests finish
afterAll(async () => {
    await mongoose.connection.collection("users").deleteMany({ email: "test@example.com" });
    await mongoose.disconnect();
}, 30000);

// TEST 1: Successful registration
test("should register a new user and return a token", async () => {
    const response = await request(app)
        .post("/auth/register")
        .send({ email: "test@example.com", password: "password123" });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeTruthy();
    expect(response.body.email).toBe("test@example.com");
});

// TEST 2: Missing email
test("should return error if email is missing", async () => {
    const response = await request(app)
        .post("/auth/register")
        .send({ password: "password123" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Email and password are required");
});

// TEST 3: Password too short
test("should return error if password is less than 6 characters", async () => {
    const response = await request(app)
        .post("/auth/register")
        .send({ email: "test2@example.com", password: "abc" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Password must be at least 6 characters");
});

// TEST 4: Duplicate email
test("should return error if user already exists", async () => {
    const response = await request(app)
        .post("/auth/register")
        .send({ email: "test@example.com", password: "password123" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("User already exists");
});
// TEST 5: Successful login
test("should login an existing user and return a token", async ()=> {
    const response = await request(app)
        .post("/auth/login")
        .send({ email: "test@example.com", password: "password123" });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.email).toBe("test@example.com");
});
// TEST 6: Wrong Password
test("should return error if password entered is wrong", async() => {
    const response = await request(app)
        .post("/auth/login")
        .send({ email: "test@example.com", password: "abc1234"})
    expect(response.status).toBe(400)
    expect(response.body.error).toBe("Invalid credentials")
})
//TEST 7: Wrong email
test("should return error if email is not registered", async () => {
    const response = await request(app)
        .post("/auth/login")
        .send({ email: "test1234@example.com", password: "password123" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid credentials");
})
//TEST 8: Missing email
test("should return error if email is not entered", async () => {
    const response = await request(app)
        .post("/auth/login")
        .send({ password: "password123" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Email and Password are required");
})
//TEST 9: Missing password
test("should return error if password is not entered ", async() => {
    const response = await request(app)
        .post("/auth/login")
        .send({ email: "test@example.com" })
    expect(response.status).toBe(400)
    expect(response.body.error).toBe("Email and Password are required")
})
