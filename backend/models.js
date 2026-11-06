import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "counter"], required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

userSchema.pre("save", async function hashPassword() {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    sku: { type: String, default: "", trim: true, maxlength: 50 },
    category: { type: String, default: "", trim: true, maxlength: 100 },
    brand: { type: String, default: "", trim: true, maxlength: 100 },
    subcategory: { type: String, default: "", trim: true, maxlength: 100 },
    price: { type: Number, required: true, min: 0 },
    cost_price: { type: Number, default: null, min: 0 },
    stock: { type: Number, required: true, min: 0, validate: Number.isInteger },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);
productSchema.index({ name: 1 });

const foodCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    normalized_name: { type: String, required: true, unique: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

const settingsSchema = new Schema({
  shop_name: { type: String, default: "My Store", maxlength: 100 },
  address: { type: String, default: "", maxlength: 500 },
  phone: { type: String, default: "", maxlength: 30 },
  gstin: { type: String, default: "", maxlength: 30 },
  gst_enabled: { type: Boolean, default: false },
  gst_rate: { type: Number, default: 0, min: 0, max: 100 },
});

const saleItemSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    cost_price: { type: Number, default: null, min: 0 },
    quantity: { type: Number, required: true, min: 1, max: 100000 },
  },
  { _id: false },
);

const saleSchema = new Schema(
  {
    order_code: { type: String, required: true, unique: true },
    customer_code: { type: String, required: true, unique: true },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    customer: { type: String, default: "", maxlength: 100 },
    customer_phone: { type: String, match: /^[6-9][0-9]{9}$/ },
    payment_method: { type: String, enum: ["Cash", "UPI", "Card"], required: true },
    status: {
      type: String,
      enum: ["pending_payment", "preparing", "completed", "cancelled"],
      default: "pending_payment",
    },
    items: { type: [saleItemSchema], required: true, validate: (items) => items.length > 0 && items.length <= 200 },
    subtotal: { type: Number, required: true, min: 0 },
    gst_rate: { type: Number, required: true, min: 0, max: 100 },
    gst_amount: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    shop_name: { type: String, required: true },
    shop_address: { type: String, default: "" },
    shop_phone: { type: String, default: "" },
    shop_gstin: { type: String, default: "" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);
saleSchema.index({ created_by: 1, created_at: -1 });
saleSchema.index({ created_at: -1 });

const counterSchema = new Schema({
  _id: { type: String },
  value: { type: Number, required: true, default: 0 },
});

export const User = mongoose.model("User", userSchema);
export const Product = mongoose.model("Product", productSchema);
export const FoodCategory = mongoose.model("FoodCategory", foodCategorySchema);
export const Settings = mongoose.model("Settings", settingsSchema);
export const Sale = mongoose.model("Sale", saleSchema);
export const Counter = mongoose.model("Counter", counterSchema);
