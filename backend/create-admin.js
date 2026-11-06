import "dotenv/config";
import mongoose from "mongoose";
import { User } from "./models.js";

const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!MONGODB_URI) throw new Error("MONGODB_URI is required");
if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  throw new Error("Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters) in backend/.env");
}

try {
  await mongoose.connect(MONGODB_URI);
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) throw new Error(`An account already exists for ${email}`);
  const admin = await User.create({
    name: ADMIN_NAME.trim(),
    email,
    password: ADMIN_PASSWORD,
    role: "admin",
  });
  console.log(`Admin account created: ${admin.email}`);
} finally {
  await mongoose.disconnect();
}
