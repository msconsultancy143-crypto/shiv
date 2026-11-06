import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { Counter, FoodCategory, Product, Sale, Settings, User } from "./models.js";

const app = express();
const port = Number(process.env.PORT || 5000);
const jwtSecret = process.env.JWT_SECRET;
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be set to a random value of at least 32 characters");
}

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use((req, _res, next) => {
  req.body ??= {};
  next();
});

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const publicUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
  created_at: user.created_at,
});

const publicProduct = (product, includeCost = false) => ({
  id: product._id.toString(),
  name: product.name,
  sku: product.sku,
  category: product.category,
  brand: product.brand,
  subcategory: product.subcategory,
  price: product.price,
  ...(includeCost ? { cost_price: product.cost_price } : {}),
  stock: product.stock,
  active: product.active,
  created_at: product.created_at,
});

const publicSale = (sale) => ({
  id: sale._id.toString(),
  order_code: sale.order_code,
  customer_code: sale.customer_code,
  created_at: sale.created_at,
  customer: sale.customer,
  customer_phone: sale.customer_phone,
  payment_method: sale.payment_method,
  status: sale.status,
  items: sale.items.map(({ product_id, name, price, quantity }) => ({
    product_id,
    name,
    price,
    quantity,
  })),
  subtotal: sale.subtotal,
  gst_rate: sale.gst_rate,
  gst_amount: sale.gst_amount,
  total: sale.total,
  shop_name: sale.shop_name,
  shop_address: sale.shop_address,
  shop_phone: sale.shop_phone,
  shop_gstin: sale.shop_gstin,
});

const authenticate = asyncRoute(async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ error: "Authentication required" });
  let claims;
  try {
    claims = jwt.verify(token, jwtSecret);
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
  const user = await User.findById(claims.sub);
  if (!user?.active) return res.status(401).json({ error: "Account is inactive or no longer exists" });
  req.user = user;
  return next();
});

const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) return res.status(403).json({ error: `${role} access required` });
  return next();
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." },
});

const validId = (id) => mongoose.isValidObjectId(id);
const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const validOptionalString = (value, maxLength) =>
  value === undefined || (typeof value === "string" && value.length <= maxLength);
const isValidProduct = (body) =>
  typeof body.name === "string" &&
  body.name.trim().length > 0 &&
  body.name.trim().length <= 100 &&
  finiteNumber(body.price) &&
  body.price >= 0 &&
  Math.round(body.price * 100) / 100 === body.price &&
  finiteNumber(body.cost_price) &&
  body.cost_price >= 0 &&
  Math.round(body.cost_price * 100) / 100 === body.cost_price &&
  Number.isInteger(body.stock) &&
  body.stock >= 0 &&
  validOptionalString(body.sku, 50) &&
  validOptionalString(body.category, 100) &&
  validOptionalString(body.brand, 100) &&
  validOptionalString(body.subcategory, 100) &&
  (body.active === undefined || typeof body.active === "boolean");

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post(
  "/api/auth/login",
  loginLimiter,
  asyncRoute(async (req, res) => {
    const identity = typeof req.body.identity === "string" ? req.body.identity.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!identity || !password) return res.status(400).json({ error: "Username/email and password are required" });
    const email = (identity.includes("@") ? identity : `${identity}@counter.local`).toLowerCase();
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Incorrect username/email or password" });
    }
    if (!user.active) return res.status(403).json({ error: "This account is inactive. Contact your admin." });
    const token = jwt.sign({}, jwtSecret, { subject: user._id.toString(), expiresIn: "12h" });
    return res.json({ token, user: publicUser(user) });
  }),
);

app.get(
  "/api/auth/me",
  authenticate,
  (req, res) => res.json({ user: publicUser(req.user) }),
);

app.get(
  "/api/categories",
  authenticate,
  asyncRoute(async (_req, res) => {
    const [savedCategories, existingProductCategories] = await Promise.all([
      FoodCategory.find().sort({ name: 1 }).lean(),
      Product.distinct("category", { category: { $nin: ["", "Cigarettes"] } }),
    ]);
    const categoryNames = new Map(
      savedCategories.map((category) => [category.normalized_name, category.name]),
    );
    for (const name of existingProductCategories) {
      if (typeof name !== "string" || !name.trim() || name.trim().toLowerCase() === "cigarettes") continue;
      const trimmedName = name.trim();
      const normalizedName = trimmedName.toLowerCase();
      if (!categoryNames.has(normalizedName)) categoryNames.set(normalizedName, trimmedName);
    }
    const categories = [...categoryNames.values()].sort((a, b) => a.localeCompare(b));
    return res.json({ categories });
  }),
);

app.post(
  "/api/categories",
  authenticate,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length > 100) {
      return res.status(400).json({ error: "Category name is required and must be 100 characters or fewer." });
    }
    const normalizedName = name.toLowerCase();
    const existing = await FoodCategory.findOne({ normalized_name: normalizedName });
    if (existing) return res.status(409).json({ error: "That food category already exists." });
    try {
      const category = await FoodCategory.create({ name, normalized_name: normalizedName });
      return res.status(201).json({ category: category.name });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: "That food category already exists." });
      throw error;
    }
  }),
);

app.get(
  "/api/products",
  authenticate,
  asyncRoute(async (req, res) => {
    const products = await Product.find().sort({ name: 1 });
    return res.json({ products: products.map((product) => publicProduct(product, req.user.role === "admin")) });
  }),
);

app.post(
  "/api/products",
  authenticate,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    if (!isValidProduct(req.body)) return res.status(400).json({ error: "Product name, selling price, manufacturing cost and whole-number stock are required" });
    const product = await Product.create({
      name: req.body.name,
      sku: req.body.sku || "",
      category: req.body.category || "",
      brand: req.body.brand || "",
      subcategory: req.body.subcategory || "",
      price: req.body.price,
      cost_price: req.body.cost_price,
      stock: req.body.stock,
      active: req.body.active ?? true,
    });
    return res.status(201).json({ product: publicProduct(product, true) });
  }),
);

app.put(
  "/api/products/:id",
  authenticate,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid product ID" });
    if (!isValidProduct(req.body)) return res.status(400).json({ error: "Product name, selling price, manufacturing cost and whole-number stock are required" });
    const fields = ["name", "sku", "category", "brand", "subcategory", "price", "cost_price", "stock", "active"];
    const update = Object.fromEntries(fields.filter((field) => req.body[field] !== undefined).map((field) => [field, req.body[field]]));
    const product = await Product.findByIdAndUpdate(req.params.id, update, { returnDocument: "after", runValidators: true });
    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json({ product: publicProduct(product, true) });
  }),
);

app.get(
  "/api/settings",
  authenticate,
  asyncRoute(async (_req, res) => {
    const settings = await Settings.findOne().lean();
    return res.json({ settings: { id: 1, ...settings } });
  }),
);

app.patch(
  "/api/settings",
  authenticate,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const { shop_name, address, phone, gstin, gst_enabled, gst_rate } = req.body;
    if (
      typeof shop_name !== "string" || shop_name.trim().length < 1 || shop_name.length > 100 ||
      typeof address !== "string" || address.length > 500 ||
      typeof phone !== "string" || phone.length > 30 ||
      typeof gstin !== "string" || gstin.length > 30 ||
      typeof gst_enabled !== "boolean" ||
      !finiteNumber(gst_rate) || gst_rate < 0 || gst_rate > 100
    ) return res.status(400).json({ error: "Invalid shop settings" });
    const settings = await Settings.findOneAndUpdate(
      {},
      { shop_name: shop_name.trim(), address, phone, gstin, gst_enabled, gst_rate },
      { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return res.json({ settings: { id: 1, ...settings } });
  }),
);

app.get(
  "/api/staff",
  authenticate,
  requireRole("admin"),
  asyncRoute(async (_req, res) => {
    const staff = await User.find().sort({ created_at: 1 });
    return res.json({ staff: staff.map(publicUser) });
  }),
);

app.post(
  "/api/staff",
  authenticate,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!name) return res.status(400).json({ error: "Enter the staff member's name." });
    if (name.length > 100) return res.status(400).json({ error: "Name must be 100 characters or fewer." });
    if (!/^[A-Za-z0-9._-]{1,50}$/.test(username)) {
      return res.status(400).json({ error: "Username must be 1-50 characters using only letters, numbers, dots, underscores or hyphens." });
    }
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    const email = `${username.toLowerCase()}@counter.local`;
    if (await User.exists({ email })) {
      return res.status(409).json({ error: "A staff account with that username already exists." });
    }
    const user = await User.create({ name, email, password, role: "counter" });
    return res.status(201).json({ user: publicUser(user) });
  }),
);

app.patch(
  "/api/staff/:id",
  authenticate,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid staff ID" });
    if (typeof req.body.active !== "boolean") return res.status(400).json({ error: "Active must be true or false" });
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: "counter" },
      { active: req.body.active },
      { returnDocument: "after", runValidators: true },
    );
    if (!user) return res.status(404).json({ error: "Counter staff account not found" });
    return res.json({ user: publicUser(user) });
  }),
);

app.get(
  "/api/analytics",
  authenticate,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const hasCustomRange = req.query.from !== undefined || req.query.to !== undefined;
    let start;
    let days;
    if (hasCustomRange) {
      const { from, to } = req.query;
      const isValidDate = (value) => {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      };
      if (!isValidDate(from) || !isValidDate(to) || from > to) {
        return res.status(400).json({ error: "Choose a valid start and end date, with the start date first." });
      }
      start = new Date(`${from}T00:00:00.000Z`);
      days = (new Date(`${to}T00:00:00.000Z`).getTime() - start.getTime()) / 86400000 + 1;
    } else {
      days = Number(req.query.days || 30);
      if (![7, 30, 90].includes(days)) {
        return res.status(400).json({ error: "Analytics period must be 7, 30 or 90 days." });
      }
      start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - days + 1);
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + days);
    const sales = await Sale.find({
      created_at: { $gte: start, $lt: end },
      status: { $ne: "cancelled" },
    })
      .select("created_at subtotal total payment_method items")
      .lean();
    const dailyByDate = new Map();
    const productsById = new Map();
    const paymentMethods = new Map();
    let totalRevenue = 0;
    let totalProfit = 0;
    let unitsSold = 0;
    let unitsWithoutCost = 0;

    for (const sale of sales) {
      const dateKey = sale.created_at.toISOString().slice(0, 10);
      const daily = dailyByDate.get(dateKey) || {
        date: dateKey,
        sales: 0,
        profit: 0,
        orders: 0,
        unitsSold: 0,
        unitsWithoutCost: 0,
      };
      daily.sales += sale.subtotal;
      daily.orders += 1;
      dailyByDate.set(dateKey, daily);
      totalRevenue += sale.subtotal;

      const payment = paymentMethods.get(sale.payment_method) || {
        method: sale.payment_method,
        orders: 0,
        amount: 0,
      };
      payment.orders += 1;
      payment.amount += sale.total;
      paymentMethods.set(sale.payment_method, payment);

      for (const item of sale.items) {
        const quantity = item.quantity;
        unitsSold += quantity;
        daily.unitsSold += quantity;
        const productId = item.product_id?.toString() || item.name;
        const product = productsById.get(productId) || {
          product_id: productId,
          name: item.name,
          quantity: 0,
          revenue: 0,
          profit: 0,
          unitsWithoutCost: 0,
        };
        product.quantity += quantity;
        product.revenue += item.price * quantity;
        if (Number.isFinite(item.cost_price)) {
          const profit = Math.round((item.price - item.cost_price) * quantity * 100) / 100;
          product.profit += profit;
          totalProfit += profit;
          daily.profit += profit;
        } else {
          product.unitsWithoutCost += quantity;
          unitsWithoutCost += quantity;
          daily.unitsWithoutCost += quantity;
        }
        productsById.set(productId, product);
      }
    }

    const dailySales = [];
    for (let offset = 0; offset < days; offset += 1) {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + offset);
      const dateKey = day.toISOString().slice(0, 10);
      dailySales.push(
        dailyByDate.get(dateKey) || {
          date: dateKey,
          sales: 0,
          profit: 0,
          orders: 0,
          unitsSold: 0,
          unitsWithoutCost: 0,
        },
      );
    }
    const bestDay = dailySales.reduce(
      (best, day) => (day.sales > (best?.sales || 0) ? day : best),
      null,
    );

    return res.json({
      days,
      summary: {
        revenue: Math.round(totalRevenue * 100) / 100,
        profit: Math.round(totalProfit * 100) / 100,
        unitsSold,
        orders: sales.length,
        averageOrderValue: sales.length
          ? Math.round((totalRevenue / sales.length) * 100) / 100
          : 0,
        bestDay:
          bestDay && bestDay.sales > 0
            ? {
                date: bestDay.date,
                sales: Math.round(bestDay.sales * 100) / 100,
                orders: bestDay.orders,
              }
            : null,
        unitsWithoutCost,
      },
      paymentMethods: [...paymentMethods.values()].map((payment) => ({
        ...payment,
        amount: Math.round(payment.amount * 100) / 100,
        share: sales.length
          ? Math.round((payment.orders / sales.length) * 100)
          : 0,
      })),
      dailySales: dailySales.map((day) => ({
        ...day,
        sales: Math.round(day.sales * 100) / 100,
        profit: Math.round(day.profit * 100) / 100,
      })),
      products: [...productsById.values()]
        .map((product) => ({
          ...product,
          revenue: Math.round(product.revenue * 100) / 100,
          profit: Math.round(product.profit * 100) / 100,
        }))
        .sort((a, b) => b.quantity - a.quantity),
    });
  }),
);

app.get(
  "/api/orders",
  authenticate,
  asyncRoute(async (req, res) => {
    const filter = req.user.role === "admin" ? {} : { created_by: req.user._id };
    const sales = await Sale.find(filter).sort({ created_at: -1 }).limit(100);
    return res.json({ sales: sales.map(publicSale) });
  }),
);

app.post(
  "/api/orders/reserve",
  authenticate,
  requireRole("counter"),
  asyncRoute(async (_req, res) => {
    const orderCounter = await Counter.findByIdAndUpdate(
      "order_code",
      { $inc: { value: 1 } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );
    const customerCounter = await Counter.findByIdAndUpdate(
      "customer_code",
      { $inc: { value: 1 } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );
    if (customerCounter.value > 9999999) return res.status(409).json({ error: "Seven-digit customer IDs are exhausted" });
    return res.json({
      ids: {
        order_code: String(orderCounter.value),
        customer_code: String(customerCounter.value).padStart(7, "0"),
        created_at: new Date().toISOString(),
      },
    });
  }),
);

app.post(
  "/api/orders",
  authenticate,
  requireRole("counter"),
  asyncRoute(async (req, res) => {
    const { order_code, customer_code, items, customer = "", customer_phone = "", payment_method } = req.body;
    if (!/^[0-9]+$/.test(String(order_code || "")) || !/^[0-9]{7}$/.test(String(customer_code || ""))) {
      return res.status(400).json({ error: "Invalid order or customer ID" });
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 200) return res.status(400).json({ error: "An order must contain between 1 and 200 items" });
    if (new Set(items.map((item) => item?.product_id)).size !== items.length) return res.status(400).json({ error: "Duplicate products are not allowed" });
    if (typeof customer !== "string" || customer.length > 100) return res.status(400).json({ error: "Customer name must be 100 characters or fewer" });
    if (customer_phone !== "" && (typeof customer_phone !== "string" || !/^[6-9][0-9]{9}$/.test(customer_phone))) {
      return res.status(400).json({ error: "Enter a valid 10-digit Indian mobile number." });
    }
    if (!["Cash", "UPI", "Card"].includes(payment_method)) return res.status(400).json({ error: "Invalid payment method" });
    for (const item of items) {
      if (!validId(item?.product_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100000) {
        return res.status(400).json({ error: "Invalid product or quantity" });
      }
    }

    const mongoSession = await mongoose.startSession();
    let createdSale;
    try {
      await mongoSession.withTransaction(async () => {
        let subtotal = 0;
        const saleItems = [];
        for (const item of [...items].sort((a, b) => a.product_id.localeCompare(b.product_id))) {
          const product = await Product.findOneAndUpdate(
            { _id: item.product_id, active: true, stock: { $gte: item.quantity } },
            { $inc: { stock: -item.quantity } },
            { returnDocument: "after", session: mongoSession },
          );
          if (!product) throw Object.assign(new Error("Product unavailable or insufficient stock"), { status: 409 });
          subtotal += product.price * item.quantity;
          saleItems.push({
            product_id: product._id,
            name: product.name,
            price: product.price,
            cost_price: product.cost_price,
            quantity: item.quantity,
          });
        }
        const settings = await Settings.findOne().session(mongoSession);
        if (!settings) throw new Error("Store settings are not configured");
        const gstRate = settings.gst_enabled ? settings.gst_rate : 0;
        const gstAmount = settings.gst_enabled ? Math.round(subtotal * gstRate) / 100 : 0;
        const [sale] = await Sale.create(
          [{
            order_code: String(order_code),
            customer_code: String(customer_code),
            created_by: req.user._id,
            customer: customer.trim(),
            customer_phone: customer_phone || undefined,
            payment_method,
            items: saleItems,
            subtotal,
            gst_rate: gstRate,
            gst_amount: gstAmount,
            total: subtotal + gstAmount,
            shop_name: settings.shop_name || "My Store",
            shop_address: settings.address || "",
            shop_phone: settings.phone || "",
            shop_gstin: settings.gstin || "",
          }],
          { session: mongoSession },
        );
        createdSale = sale;
      });
    } finally {
      await mongoSession.endSession();
    }
    return res.status(201).json({ sale: publicSale(createdSale) });
  }),
);

app.patch(
  "/api/orders/:id/items",
  authenticate,
  requireRole("counter"),
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid order ID" });
    const { items } = req.body;
    if (!Array.isArray(items) || items.length < 1 || items.length > 200) {
      return res.status(400).json({ error: "An order must contain between 1 and 200 items" });
    }
    if (new Set(items.map((item) => item?.product_id)).size !== items.length) {
      return res.status(400).json({ error: "Duplicate products are not allowed" });
    }
    for (const item of items) {
      if (!validId(item?.product_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100000) {
        return res.status(400).json({ error: "Invalid product or quantity" });
      }
    }

    const mongoSession = await mongoose.startSession();
    let updatedSale;
    let changedProducts = [];
    try {
      await mongoSession.withTransaction(async () => {
        const sale = await Sale.findOne({
          _id: req.params.id,
          created_by: req.user._id,
          status: { $in: ["pending_payment", "preparing"] },
        }).session(mongoSession);
        if (!sale) throw Object.assign(new Error("Order not found or can no longer be edited"), { status: 409 });

        const previousItems = new Map(sale.items.map((item) => [item.product_id.toString(), item]));
        const requestedIds = new Set(items.map((item) => item.product_id));
        const nextItems = [];
        const changedProductsById = new Map();

        for (const requestedItem of [...items].sort((a, b) => a.product_id.localeCompare(b.product_id))) {
          const previousItem = previousItems.get(requestedItem.product_id);
          if (previousItem) {
            const difference = requestedItem.quantity - previousItem.quantity;
            if (difference > 0) {
              const product = await Product.findOneAndUpdate(
                { _id: requestedItem.product_id, active: true, stock: { $gte: difference } },
                { $inc: { stock: -difference } },
                { returnDocument: "after", session: mongoSession },
              );
              if (!product) throw Object.assign(new Error("Product unavailable or insufficient stock"), { status: 409 });
              changedProductsById.set(product._id.toString(), product);
            } else if (difference < 0) {
              const product = await Product.findOneAndUpdate(
                { _id: requestedItem.product_id },
                { $inc: { stock: -difference } },
                { returnDocument: "after", session: mongoSession },
              );
              if (!product) throw Object.assign(new Error("A product in this order no longer exists; its stock cannot be restored."), { status: 409 });
              changedProductsById.set(product._id.toString(), product);
            }
            nextItems.push({
              product_id: previousItem.product_id,
              name: previousItem.name,
              price: previousItem.price,
              cost_price: previousItem.cost_price,
              quantity: requestedItem.quantity,
            });
          } else {
            const product = await Product.findOneAndUpdate(
              { _id: requestedItem.product_id, active: true, stock: { $gte: requestedItem.quantity } },
              { $inc: { stock: -requestedItem.quantity } },
              { returnDocument: "after", session: mongoSession },
            );
            if (!product) throw Object.assign(new Error("Product unavailable or insufficient stock"), { status: 409 });
            changedProductsById.set(product._id.toString(), product);
            nextItems.push({
              product_id: product._id,
              name: product.name,
              price: product.price,
              cost_price: product.cost_price,
              quantity: requestedItem.quantity,
            });
          }
        }

        for (const previousItem of sale.items) {
          if (requestedIds.has(previousItem.product_id.toString())) continue;
          const product = await Product.findOneAndUpdate(
            { _id: previousItem.product_id },
            { $inc: { stock: previousItem.quantity } },
            { returnDocument: "after", session: mongoSession },
          );
          if (!product) throw Object.assign(new Error("A product in this order no longer exists; its stock cannot be restored."), { status: 409 });
          changedProductsById.set(product._id.toString(), product);
        }

        const subtotal = nextItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        sale.items = nextItems;
        sale.subtotal = subtotal;
        sale.gst_amount = Math.round(subtotal * sale.gst_rate) / 100;
        sale.total = subtotal + sale.gst_amount;
        await sale.save({ session: mongoSession });
        updatedSale = sale;
        changedProducts = [...changedProductsById.values()];
      });
    } finally {
      await mongoSession.endSession();
    }
    return res.json({
      sale: publicSale(updatedSale),
      products: changedProducts.map((product) => publicProduct(product)),
    });
  }),
);

app.delete(
  "/api/orders/:id",
  authenticate,
  requireRole("counter"),
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid order ID" });

    const mongoSession = await mongoose.startSession();
    let cancelledSale;
    let changedProducts = [];
    try {
      await mongoSession.withTransaction(async () => {
        changedProducts = [];
        const sale = await Sale.findOne({
          _id: req.params.id,
          created_by: req.user._id,
          status: { $in: ["pending_payment", "preparing"] },
        }).session(mongoSession);
        if (!sale) throw Object.assign(new Error("Order not found or can no longer be cancelled"), { status: 409 });

        for (const item of [...sale.items].sort((a, b) => a.product_id.toString().localeCompare(b.product_id.toString()))) {
          const product = await Product.findOneAndUpdate(
            { _id: item.product_id },
            { $inc: { stock: item.quantity } },
            { returnDocument: "after", session: mongoSession },
          );
          if (!product) throw Object.assign(new Error("A product in this order no longer exists; its stock cannot be restored."), { status: 409 });
          changedProducts.push(product);
        }

        sale.status = "cancelled";
        await sale.save({ session: mongoSession });
        cancelledSale = sale;
      });
    } finally {
      await mongoSession.endSession();
    }
    return res.json({
      sale: publicSale(cancelledSale),
      products: changedProducts.map((product) => publicProduct(product)),
    });
  }),
);

app.patch(
  "/api/orders/:id/status",
  authenticate,
  requireRole("counter"),
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid order ID" });
    const { next_status: nextStatus } = req.body;
    const allowedTransitions = {
      pending_payment: "preparing",
      preparing: "completed",
    };
    const mongoSession = await mongoose.startSession();
    let updatedSale;
    try {
      await mongoSession.withTransaction(async () => {
        const sale = await Sale.findOneAndUpdate(
          {
            _id: req.params.id,
            created_by: req.user._id,
            status: {
              $in: Object.keys(allowedTransitions).filter(
                (status) => allowedTransitions[status] === nextStatus,
              ),
            },
          },
          { status: nextStatus },
          { returnDocument: "after", runValidators: true, session: mongoSession },
        );
        if (!sale) {
          throw Object.assign(
            new Error("Order not found or invalid order status transition"),
            { status: 409 },
          );
        }
        updatedSale = sale;
      });
    } finally {
      await mongoSession.endSession();
    }
    return res.json({ sale: publicSale(updatedSale) });
  }),
);

app.use((err, _req, res, _next) => {
  if (err.code === 11000) return res.status(409).json({ error: "That username or order ID already exists" });
  if (err.name === "ValidationError" || err.name === "CastError") return res.status(400).json({ error: err.message });
  if (err.message === "Origin is not allowed by CORS") return res.status(403).json({ error: err.message });
  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error(err);
  return res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
});

await mongoose.connect(process.env.MONGODB_URI);
await Settings.findOneAndUpdate(
  {},
  { $setOnInsert: { shop_name: "My Store" } },
  { upsert: true, setDefaultsOnInsert: true },
);
await Promise.all(
  ["order_code", "customer_code"].map((id) =>
    Counter.updateOne(
      { _id: id },
      { $setOnInsert: { value: 0 } },
      { upsert: true },
    ),
  ),
);
app.listen(port, () => console.log(`API server listening on port ${port}`));
