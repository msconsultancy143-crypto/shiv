import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiBase, jsonBody } from "./api.js";
import {
  ArrowRight,
  BadgeIndianRupee,
  BarChart3,
  Check,
  CircleHelp,
  CreditCard,
  Download,
  Grid2X2,
  LogOut,
  MessageCircle,
  Minus,
  Package,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings2,
  ShoppingBag,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import "./App.css";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const toUtcDateInput = (value) => value.toISOString().slice(0, 10);
const shiftUtcDateInput = (value, offset) => {
  const shifted = new Date(`${value}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return toUtcDateInput(shifted);
};
const defaultSettings = {
  id: 1,
  shop_name: "My Store",
  address: "",
  phone: "",
  gstin: "",
  gst_enabled: false,
  gst_rate: 0,
};
const tones = ["peach", "sage", "lavender", "blue", "yellow", "rose"];
const emptyProduct = {
  name: "",
  sku: "",
  category: "",
  brand: "",
  subcategory: "",
  price: "",
  cost_price: "",
  stock: "",
};
const today = date(new Date());
const orderLabels = {
  pending_payment: "Payment pending",
  preparing: "Preparing",
  completed: "Completed",
  cancelled: "Cancelled",
};
const receiptStatusLabels = {
  pending_payment: "PAYMENT PENDING",
  preparing: "PAYMENT CONFIRMED · PREPARING",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};
const productSections = ["Cigarettes", "Other food items"];
const sectionForProduct = (product) =>
  product.category?.trim().toLowerCase() === "cigarettes"
    ? "Cigarettes"
    : "Other food items";
const staffFieldError = (field, value) => {
  if (field === "name" && !value.trim()) return "Enter the staff member's name.";
  if (field === "username") {
    if (!value.trim()) return "Enter a username.";
    if (!/^[A-Za-z0-9._-]{1,50}$/.test(value.trim())) {
      return "Use 1-50 letters, numbers, dots, underscores or hyphens.";
    }
  }
  if (field === "password" && value.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return "";
};

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(() =>
    Boolean(localStorage.getItem("counter_token")),
  );
  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [foodCategories, setFoodCategories] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState(defaultSettings);
  const [sales, setSales] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsRange, setAnalyticsRange] = useState(() => {
    const to = toUtcDateInput(new Date());
    return { from: shiftUtcDateInput(to, -29), to };
  });
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [analyticsExporting, setAnalyticsExporting] = useState(false);
  const [analyticsSeries, setAnalyticsSeries] = useState({
    sales: true,
    orders: true,
    profit: true,
  });
  const [productMetric, setProductMetric] = useState("quantity");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [orderIds, setOrderIds] = useState(null);
  const [staff, setStaff] = useState([]);
  const [view, setView] = useState("billing");
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [cart, setCart] = useState([]);
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPhoneError, setCustomerPhoneError] = useState("");
  const [payment, setPayment] = useState("Cash");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderAction, setOrderAction] = useState(null);
  const [editSale, setEditSale] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [cancelSaleTarget, setCancelSaleTarget] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [sharingReceipt, setSharingReceipt] = useState(false);
  const [productForm, setProductForm] = useState(null);
  const [categoryForm, setCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [staffForm, setStaffForm] = useState(null);
  const [staffFormError, setStaffFormError] = useState("");
  const [staffTouched, setStaffTouched] = useState({});
  const [login, setLogin] = useState({ identity: "", password: "" });
  const admin = profile?.role === "admin";

  useEffect(() => {
    const clearSession = () => {
      localStorage.removeItem("counter_token");
      setSession(null);
      setProfile(null);
      setProducts([]);
      setFoodCategories([]);
      setSales([]);
      setStaff([]);
      setCart([]);
      setOrderIds(null);
      setEditSale(null);
      setEditItems([]);
      setCancelSaleTarget(null);
      setView("billing");
    };
    const onUnauthorized = () => clearSession();
    window.addEventListener("counter:unauthorized", onUnauthorized);
    if (localStorage.getItem("counter_token")) {
      api("/auth/me")
        .then(({ user }) => {
          setSession({ user });
          setProfile(user);
          setView("sales");
        })
        .catch((error) => {
          clearSession();
          setNotice(error.message);
        })
        .finally(() => setAuthLoading(false));
    }
    return () => window.removeEventListener("counter:unauthorized", onUnauthorized);
  }, []);

  useEffect(() => {
    if (!profile) return;
    async function loadData() {
      try {
        const [productResult, categoryResult, settingsResult, salesResult, staffResult] =
          await Promise.all([
            api("/products"),
            api("/categories"),
            api("/settings"),
            api("/orders"),
            profile.role === "admin" ? api("/staff") : Promise.resolve({ staff: [] }),
          ]);
        setProducts(productResult.products);
        setFoodCategories(categoryResult.categories);
        setSettings(settingsResult.settings);
        setSettingsDraft(settingsResult.settings);
        setSales(salesResult.sales);
        setStaff(staffResult.staff);
      } catch (error) {
        setNotice(error.message);
      }
    }
    loadData();
  }, [profile]);

  useEffect(() => {
    if (orderIds && view === "billing") searchInputRef.current?.focus();
  }, [orderIds, view]);

  useEffect(() => {
    if (view !== "analytics" || !admin) return;
    if (!analyticsRange.from || !analyticsRange.to || analyticsRange.from > analyticsRange.to) {
      return;
    }
    let active = true;
    const params = new URLSearchParams(analyticsRange);
    api(`/analytics?${params}`)
      .then((result) => {
        if (active) {
          setAnalytics(result);
          setAnalyticsError("");
        }
      })
      .catch((error) => {
        if (active) setAnalyticsError(error.message);
      })
      .finally(() => {
        if (active) setAnalyticsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, admin, analyticsRange]);

  const activeProducts = products.filter((product) => product.active);
  const visibleProducts = activeProducts.filter(
    (product) =>
      `${product.name} ${product.sku || ""} ${product.brand || ""} ${product.category || ""} ${product.subcategory || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const subtotal = cart.reduce(
    (total, item) => total + Number(item.price) * item.quantity,
    0,
  );
  const isGstExemptLine = (item) => {
    if (typeof item.gst_exempt === "boolean") return item.gst_exempt;
    const category = item.category || products.find((product) => product.id === item.product_id)?.category;
    return category?.trim().toLowerCase() === "cigarettes";
  };
  const taxableSubtotal = cart.reduce(
    (sum, item) => sum + (isGstExemptLine(item) ? 0 : Number(item.price) * item.quantity),
    0,
  );
  const tax = settings.gst_enabled
    ? Math.round(taxableSubtotal * Number(settings.gst_rate)) / 100
    : 0;
  const total = subtotal + tax;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const editedSubtotal = editItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0,
  );
  const editedTaxableSubtotal = editItems.reduce(
    (sum, item) => sum + (isGstExemptLine(item) ? 0 : Number(item.price || 0) * Number(item.quantity || 0)),
    0,
  );
  const editedGst = editSale
    ? Math.round(editedTaxableSubtotal * Number(editSale.gst_rate)) / 100
    : 0;

  function addProduct(product) {
    if (Number(product.stock) <= 0) return;
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing)
        return current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: Math.min(item.quantity + 1, Number(product.stock)),
              }
            : item,
        );
      return [...current, { ...product, quantity: 1 }];
    });
  }
  function changeQuantity(id, amount) {
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setCart((current) =>
      current
        .map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: Math.min(Number(item.stock), item.quantity + amount),
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }
  function removeFromCart(id) {
    setCart((current) => current.filter((item) => item.id !== id));
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  function editQuantity(id, value) {
    setQuantityDrafts((current) => ({ ...current, [id]: value }));
    if (!/^[0-9]+$/.test(value)) return;
    const enteredQuantity = Number(value);
    if (enteredQuantity < 1) return;
    const item = cart.find((cartItem) => cartItem.id === id);
    if (!item) return;
    const quantity = Math.min(enteredQuantity, Number(item.stock));
    if (quantity !== enteredQuantity) {
      setQuantityDrafts((current) => ({ ...current, [id]: String(quantity) }));
    }
    setCart((current) =>
      current.map((item) =>
        item.id === id ? { ...item, quantity } : item,
      ),
    );
  }
  function finishQuantityEdit(id) {
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const { token, user } = await api("/auth/login", {
        method: "POST",
        body: jsonBody(login),
      });
      localStorage.setItem("counter_token", token);
      setSession({ user });
      setProfile(user);
      setView("sales");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  const startOrder = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const { ids } = await api("/orders/reserve", { method: "POST" });
      setOrderIds(ids);
      setCart([]);
      setQuantityDrafts({});
      setCustomer("");
      setCustomerPhone("");
      setCustomerPhoneError("");
      setPayment("Cash");
      setView("billing");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }, [busy]);
  function cancelOrder() {
    setOrderIds(null);
    setCart([]);
    setQuantityDrafts({});
    setCustomer("");
    setCustomerPhone("");
    setCustomerPhoneError("");
    setView("sales");
  }
  const requestOrderConfirmation = useCallback(() => {
    if (customerPhone && !/^[6-9][0-9]{9}$/.test(customerPhone)) {
      setCustomerPhoneError("Enter a valid 10-digit Indian mobile number.");
      document.getElementById("customer-mobile")?.focus();
      return;
    }
    setCustomerPhoneError("");
    setConfirmAction("place");
  }, [customerPhone]);
  async function saveSale() {
    if (!cart.length || !orderIds || busy || (customerPhone && !/^[6-9][0-9]{9}$/.test(customerPhone))) return;
    setBusy(true);
    setNotice("");
    try {
      const { sale } = await api("/orders", {
        method: "POST",
        body: jsonBody({
          order_code: orderIds.order_code,
          customer_code: orderIds.customer_code,
          customer_phone: customerPhone,
          items: cart.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
          })),
          customer: customer.trim(),
          payment_method: payment,
        }),
      });
      setSales((current) => [sale, ...current]);
      setCart([]);
      setQuantityDrafts({});
      setCustomer("");
      setCustomerPhone("");
      setCustomerPhoneError("");
      setOrderIds(null);
      setView("sales");
      setNotice("Order placed. Confirm payment once received.");
      setProducts((current) =>
        current.map((product) => ({
          ...product,
          stock:
            Number(product.stock) -
            (cart.find((item) => item.id === product.id)?.quantity || 0),
        })),
      );
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function advanceOrder(order) {
    if (busy) return;
    const next = order.status === "pending_payment" ? "preparing" : "completed";
    setOrderAction({ id: order.id, next });
    setBusy(true);
    setNotice("");
    try {
      const { sale } = await api(`/orders/${order.id}/status`, {
        method: "PATCH",
        body: jsonBody({ next_status: next }),
      });
      setSales((current) =>
        current.map((item) => (item.id === order.id ? sale : item)),
      );
      setReceipt((current) => (current?.id === sale.id ? sale : current));
      setNotice(
        next === "preparing"
          ? "Payment confirmed. Order is being prepared."
          : "Order completed.",
      );
    } catch (error) {
      setNotice(error.message);
    } finally {
      setOrderAction(null);
      setBusy(false);
    }
  }
  function startEditingSale(sale) {
    setNotice("");
    setEditSale(sale);
    setEditItems(
      sale.items.map((item) => ({
        product_id: item.product_id,
        name: item.name,
        price: item.price,
        gst_exempt: isGstExemptLine(item),
        quantity: item.quantity,
      })),
    );
  }
  function changeEditedProduct(index, productId) {
    const duplicate = editItems.some(
      (item, itemIndex) => itemIndex !== index && item.product_id === productId,
    );
    if (duplicate) {
      setNotice("Each product can only appear once in an order.");
      return;
    }
    const product = activeProducts.find((item) => item.id === productId);
    if (!product) return;
    setEditItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              product_id: product.id,
              name: product.name,
              price: product.price,
              gst_exempt: sectionForProduct(product) === "Cigarettes",
              quantity: 1,
            }
          : item,
      ),
    );
  }
  async function saveEditedOrder(event) {
    event.preventDefault();
    if (
      !editSale ||
      busy ||
      !editItems.length ||
      editItems.some(
        (item) =>
          !item.product_id ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 100000,
      ) ||
      new Set(editItems.map((item) => item.product_id)).size !== editItems.length
    ) {
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const { sale, products: updatedProducts } = await api(
        `/orders/${editSale.id}/items`,
        {
          method: "PATCH",
          body: jsonBody({
            items: editItems.map(({ product_id, quantity }) => ({
              product_id,
              quantity,
            })),
          }),
        },
      );
      setSales((current) =>
        current.map((item) => (item.id === sale.id ? sale : item)),
      );
      setProducts((current) =>
        current.map(
          (product) =>
            updatedProducts.find((updated) => updated.id === product.id) || product,
        ),
      );
      setReceipt((current) => (current?.id === sale.id ? sale : current));
      setEditSale(null);
      setEditItems([]);
      setNotice(`Order updated. New total: ${money(sale.total)}.`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelSavedOrder() {
    if (!cancelSaleTarget || busy) return;
    const target = cancelSaleTarget;
    setBusy(true);
    setNotice("");
    try {
      const { sale, products: updatedProducts } = await api(
        `/orders/${target.id}`,
        { method: "DELETE" },
      );
      setSales((current) =>
        current.map((item) => (item.id === sale.id ? sale : item)),
      );
      setProducts((current) =>
        current.map(
          (product) =>
            updatedProducts.find((updated) => updated.id === product.id) || product,
        ),
      );
      setReceipt((current) => (current?.id === sale.id ? sale : current));
      setCancelSaleTarget(null);
      setNotice(
        target.status === "preparing"
          ? "Order cancelled and stock restored. Please handle the customer refund manually."
          : "Order cancelled and stock restored.",
      );
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveProduct(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const payload = {
      name: productForm.name.trim(),
      sku: productForm.sku.trim(),
      category: productForm.category.trim(),
      brand: (productForm.brand || "").trim(),
      subcategory: (productForm.subcategory || "").trim(),
      price: Number(productForm.price),
      cost_price: Number(productForm.cost_price),
      stock: Number(productForm.stock),
      active: productForm.active ?? true,
    };
    try {
      const { product } = await api(
        productForm.id ? `/products/${productForm.id}` : "/products",
        {
          method: productForm.id ? "PUT" : "POST",
          body: jsonBody(payload),
        },
      );
      setProducts((current) =>
        productForm.id
          ? current.map((item) => (item.id === product.id ? product : item))
          : [...current, product],
      );
      if (payload.category && !foodCategories.some((category) => category.toLowerCase() === payload.category.toLowerCase())) {
        setFoodCategories((current) => [...current, payload.category].sort((a, b) => a.localeCompare(b)));
      }
      setProductForm(null);
      setNotice("Product saved.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveCategory(event) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name || busy) return;
    setBusy(true);
    setCategoryError("");
    try {
      const { category } = await api("/categories", {
        method: "POST",
        body: jsonBody({ name }),
      });
      setFoodCategories((current) =>
        [...current.filter((item) => item.toLowerCase() !== category.toLowerCase()), category]
          .sort((a, b) => a.localeCompare(b)),
      );
      setCategoryForm(false);
      setCategoryName("");
      setNotice(`Food category "${category}" created.`);
    } catch (error) {
      setCategoryError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const { settings: saved } = await api("/settings", {
        method: "PATCH",
        body: jsonBody({
          ...settingsDraft,
          gst_rate: Number(settingsDraft.gst_rate),
        }),
      });
      setSettings(saved);
      setSettingsDraft(saved);
      setNotice("Settings saved.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveStaff(event) {
    event.preventDefault();
    const errors = ["name", "username", "password"]
      .map((field) => staffFieldError(field, staffForm[field]))
      .filter(Boolean);
    if (errors.length) {
      setStaffTouched({ name: true, username: true, password: true });
      return;
    }
    setBusy(true);
    setNotice("");
    setStaffFormError("");
    try {
      const { user } = await api("/staff", {
        method: "POST",
        body: jsonBody(staffForm),
      });
      setStaff((current) => [...current, user]);
      setStaffForm(null);
      setNotice("Staff account created.");
    } catch (error) {
      setStaffFormError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleStaff(person) {
    try {
      const { user } = await api(`/staff/${person.id}`, {
        method: "PATCH",
        body: jsonBody({ active: !person.active }),
      });
      setStaff((current) =>
        current.map((item) =>
          item.id === person.id ? user : item,
        ),
      );
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function shareReceiptOnWhatsApp(sale) {
    if (sharingReceipt) return;
    setSharingReceipt(true);
    const phone = String(sale.customer_phone || "").replace(/\D/g, "");
    const whatsappNumber = phone.length === 10 ? `91${phone}` : "";
    const messageDetails = [
      `Bill from ${sale.shop_name || "our store"}`,
      `Order: ${sale.order_code || sale.id}`,
      `Customer: ${sale.customer || "Walk-in customer"}`,
      `Items: ${(sale.items || []).reduce((count, item) => count + Number(item.quantity), 0)}`,
      `Subtotal: Rs. ${Number(sale.subtotal).toFixed(2)}`,
      `GST: Rs. ${Number(sale.gst_amount).toFixed(2)}`,
      `Total: Rs. ${Number(sale.total).toFixed(2)}`,
      `Payment: ${sale.payment_method}`,
      `Order status: ${receiptStatusLabels[sale.status] || sale.status}`,
    ];
    let whatsappWindow;
    try {
      whatsappWindow = window.open("about:blank", "_blank");
      if (whatsappWindow) whatsappWindow.opener = null;
      const { jsPDF } = await import("jspdf");
      const storeDetails = [
        sale.shop_address,
        sale.shop_phone && `Phone: ${sale.shop_phone}`,
        sale.shop_gstin && `GSTIN: ${sale.shop_gstin}`,
      ].filter(Boolean);
      const customerDetails = [
        `Customer ID: ${sale.customer_code || "-"}`,
        sale.customer && `Customer: ${sale.customer}`,
        sale.customer_phone && `Mobile: ${sale.customer_phone}`,
        `Payment method: ${sale.payment_method}`,
      ].filter(Boolean);
      const statusLabel = receiptStatusLabels[sale.status] || sale.status;
      const estimatedHeight = Math.min(
        14000,
        Math.max(
          155,
          137 +
            storeDetails.reduce((height, line) => height + Math.ceil(line.length / 43) * 3.5, 0) +
            customerDetails.reduce((height, line) => height + Math.ceil(line.length / 37) * 4, 0) +
            sale.items.reduce((height, item) => height + Math.max(1, Math.ceil(String(item.name).length / 34)) * 4 + 12, 0),
        ),
      );
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [80, estimatedHeight],
        compress: true,
      });
      const left = 6;
      const right = 74;
      const contentWidth = right - left;
      let y = 5;
      const drawRule = () => {
        pdf.setDrawColor(174, 181, 164);
        pdf.setLineDashPattern([1, 1.2], 0);
        pdf.line(left, y, right, y);
        pdf.setLineDashPattern([], 0);
        y += 4;
      };
      const addText = (value, { size = 8, bold = false, gap = 2, align = "left", color = [55, 66, 57] } = {}) => {
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(String(value), contentWidth);
        const lineHeight = size * 0.42;
        pdf.text(lines, align === "center" ? 40 : left, y, { align });
        y += lines.length * lineHeight + gap;
      };
      const addSummaryRow = (label, amount, { bold = false, size = 8 } = {}) => {
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(55, 66, 57);
        pdf.text(label, left, y);
        pdf.text(`Rs. ${Number(amount).toFixed(2)}`, right, y, { align: "right" });
        y += 5;
      };

      pdf.setFillColor(255, 254, 245);
      pdf.rect(0, 0, 80, estimatedHeight, "F");
      for (let x = 2; x < 80; x += 6) {
        pdf.setFillColor(235, 235, 225);
        pdf.circle(x, 1.5, 1.5, "F");
      }

      pdf.setFillColor(237, 242, 223);
      pdf.roundedRect(34, y, 12, 12, 2, 2, "F");
      pdf.setDrawColor(70, 109, 75);
      pdf.setLineWidth(0.7);
      pdf.roundedRect(37, y + 3, 6, 6, 0.8, 0.8, "S");
      pdf.line(38, y + 5, 42, y + 5);
      pdf.line(38, y + 7, 41, y + 7);
      y += 17;
      addText(sale.shop_name || "The Counter", { size: 9, bold: true, color: [87, 114, 83], gap: 1, align: "center" });
      addText("RECEIPT", { size: 21, bold: true, color: [23, 28, 24], gap: 1, align: "center" });
      addText("PAYMENT RECEIPT", { size: 7, color: [133, 135, 122], gap: 3, align: "center" });
      for (const line of storeDetails) {
        addText(line, { size: 6.5, color: [114, 118, 109], gap: 1, align: "center" });
      }

      drawRule();
      addText(`ORDER  ${sale.order_code || sale.id}`, { size: 9, bold: true, gap: 2 });
      addText(new Date(sale.created_at).toLocaleString("en-IN"), { size: 7, color: [112, 122, 112], gap: 2 });
      for (const line of customerDetails) addText(line, { size: 7, gap: 1 });

      const statusColors = sale.status === "completed"
        ? { fill: [228, 242, 229], text: [46, 112, 67] }
        : sale.status === "cancelled"
          ? { fill: [251, 235, 232], text: [154, 73, 63] }
          : sale.status === "preparing"
            ? { fill: [234, 243, 233], text: [56, 107, 77] }
            : { fill: [251, 242, 221], text: [133, 98, 31] };
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.5);
      const statusLines = pdf.splitTextToSize(statusLabel, contentWidth - 6);
      const statusHeight = Math.max(8, statusLines.length * 3 + 4);
      pdf.setFillColor(...statusColors.fill);
      pdf.roundedRect(left, y, contentWidth, statusHeight, 2, 2, "F");
      pdf.setTextColor(...statusColors.text);
      pdf.text(statusLines, 40, y + statusHeight / 2, { align: "center", baseline: "middle" });
      y += statusHeight + 4;

      drawRule();
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(112, 122, 112);
      pdf.text("ITEM", left, y);
      pdf.text("AMOUNT", right, y, { align: "right" });
      y += 5;
      pdf.setDrawColor(226, 227, 216);
      pdf.line(left, y, right, y);
      y += 2;

      for (const item of sale.items || []) {
        const amount = Number(item.price) * Number(item.quantity);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(41, 51, 41);
        const nameLines = pdf.splitTextToSize(item.name, 46);
        pdf.text(nameLines, left, y);
        pdf.setFontSize(7);
        pdf.text(`Rs. ${amount.toFixed(2)}`, right, y, { align: "right" });
        y += nameLines.length * 3.6;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(6.5);
        pdf.setTextColor(133, 138, 125);
        pdf.text(`${item.quantity} x Rs. ${Number(item.price).toFixed(2)}`, left, y);
        y += 5;
        pdf.setDrawColor(238, 238, 228);
        pdf.line(left, y - 1.5, right, y - 1.5);
      }

      y += 2;
      drawRule();
      addSummaryRow("Subtotal", sale.subtotal);
      addSummaryRow(`GST (${sale.gst_rate}%, cigarettes excluded)`, sale.gst_amount);
      pdf.setFillColor(237, 242, 228);
      pdf.roundedRect(left - 1, y - 3.5, contentWidth + 2, 13, 2, 2, "F");
      y += 1;
      addSummaryRow("TOTAL", sale.total, { bold: true, size: 12 });
      y += 6;
      addText("THANK YOU FOR SHOPPING WITH US!", { size: 7, bold: true, color: [78, 100, 79], align: "center" });
      for (let x = 2; x < 80; x += 6) {
        pdf.setFillColor(235, 235, 225);
        pdf.circle(x, estimatedHeight - 1.5, 1.5, "F");
      }

      const { url } = await api(`/orders/${sale.id}/receipt-link`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: pdf.output("blob"),
      });
      const receiptUrl = new URL(url, apiBase || window.location.origin).toString();
      const message = [...messageDetails, `PDF bill: ${receiptUrl}`].join("\n");
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      if (whatsappWindow) whatsappWindow.location.replace(whatsappUrl);
      if (!whatsappWindow) window.location.assign(whatsappUrl);
      setNotice("Secure PDF link added to WhatsApp. Review the message and press Send.");
    } catch (error) {
      whatsappWindow?.close();
      setNotice(`Could not prepare the bill PDF: ${error.message}`);
    } finally {
      setSharingReceipt(false);
    }
  }
  function signOut() {
    localStorage.removeItem("counter_token");
    setSession(null);
    setProfile(null);
    setProducts([]);
    setFoodCategories([]);
    setSales([]);
    setStaff([]);
    setCart([]);
    setOrderIds(null);
    setEditSale(null);
    setEditItems([]);
    setCancelSaleTarget(null);
    setView("billing");
    setNotice("");
  }

  useEffect(() => {
    function handleKeyboardShortcut(event) {
      const target = event.target;
      const isTyping = target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const hasOtherDialog = Boolean(
        productForm || categoryForm || staffForm || receipt || editSale || cancelSaleTarget,
      );
      const hasModal = confirmAction || showShortcuts || hasOtherDialog;

      if (event.key === "Escape") {
        if (confirmAction) {
          event.preventDefault();
          setConfirmAction(null);
        } else if (showShortcuts) {
          event.preventDefault();
          setShowShortcuts(false);
        } else if (cancelSaleTarget) {
          event.preventDefault();
          setCancelSaleTarget(null);
        } else if (editSale) {
          event.preventDefault();
          setEditSale(null);
        } else if (!hasOtherDialog && !admin && orderIds && view === "billing") {
          event.preventDefault();
          setConfirmAction("cancel");
        }
        return;
      }

      if (admin) return;
      if (hasModal) return;
      if (busy) return;
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (orderIds) setConfirmAction("cancel-and-new");
        else startOrder();
        return;
      }
      if (!isTyping && !event.altKey && !event.ctrlKey && !event.metaKey && event.key === "?") {
        event.preventDefault();
        setShowShortcuts(true);
        return;
      }
      if (view !== "billing" || !orderIds) return;
      if (event.ctrlKey && event.key === "Enter" && cart.length) {
        event.preventDefault();
        requestOrderConfirmation();
        return;
      }
      if (!isTyping && !event.altKey && !event.ctrlKey && !event.metaKey && event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      const productButton = target instanceof Element
        ? target.closest("[data-product-index]")
        : null;
      if (productButton && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const buttons = [...document.querySelectorAll("[data-product-index]")];
        const index = buttons.indexOf(productButton);
        const nextIndex = Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
        buttons[nextIndex]?.focus();
      } else if (target === searchInputRef.current && event.key === "ArrowDown" && visibleProducts.length) {
        event.preventDefault();
        document.querySelector('[data-product-index="0"]')?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [
    admin,
    view,
    orderIds,
    busy,
    cart.length,
    confirmAction,
    showShortcuts,
    productForm,
    categoryForm,
    staffForm,
    receipt,
    editSale,
    cancelSaleTarget,
    visibleProducts.length,
    startOrder,
    requestOrderConfirmation,
  ]);

  async function confirmOrderAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "place") {
      await saveSale();
    } else if (action === "cancel" || action === "cancel-and-new") {
      cancelOrder();
      if (action === "cancel-and-new") await startOrder();
    }
  }

  if (authLoading)
    return <div className="center-screen">Loading workspace...</div>;
  if (!session)
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="brand-mark">
            <img src="/counter-logo.svg" alt="The Counter" />
          </div>
          <p className="eyebrow">WELCOME BACK</p>
          <h1>Sign in to your store.</h1>
          <p className="muted">Your counter, all in one place.</p>
          <form onSubmit={signIn} className="form-stack">
            <label>
              Username or admin email
              <input
                autoComplete="username"
                required
                value={login.identity}
                onChange={(event) =>
                  setLogin({ ...login, identity: event.target.value })
                }
                placeholder="Username or email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={login.password}
                onChange={(event) =>
                  setLogin({ ...login, password: event.target.value })
                }
                placeholder="Enter your password"
              />
            </label>
            {notice && <p className="notice">{notice}</p>}
            <button className="button primary" disabled={busy}>
              Sign in <ArrowRight size={16} />
            </button>
          </form>
        </div>
        <div className="login-footer">
          A little more order in your everyday.
        </div>
      </div>
    );
  if (!profile)
    return <div className="center-screen">Loading account...</div>;

  const nav = [
    ...(!admin ? [{ id: "billing", label: "New order", icon: Grid2X2 }] : []),
    ...(admin ? [{ id: "analytics", label: "Analytics", icon: BarChart3 }] : []),
    {
      id: "sales",
      label: admin ? "All orders" : "My orders",
      icon: ReceiptText,
    },
    ...(admin
      ? [
        { id: "products", label: "Products", icon: Package },
          { id: "staff", label: "Staff", icon: Users },
          { id: "settings", label: "Settings", icon: Settings2 },
        ]
      : []),
  ];
  const analyticsRangeError =
    !analyticsRange.from || !analyticsRange.to || analyticsRange.from > analyticsRange.to
      ? "Choose a valid date range, with the start date on or before the end date."
      : "";
  const dailySales = analytics?.dailySales || [];
  const chartPeak = dailySales.reduce(
    (peak, day) => (day.sales > (peak?.sales || 0) ? day : peak),
    null,
  );
  const chartPeakValue = chartPeak?.sales || 0;
  const chartRawStep = Math.max(chartPeakValue / 4, 1);
  const chartMagnitude = 10 ** Math.floor(Math.log10(chartRawStep));
  const chartNormalizedStep = chartRawStep / chartMagnitude;
  const chartStepSize =
    (chartNormalizedStep <= 1
      ? 1
      : chartNormalizedStep <= 2
        ? 2
        : chartNormalizedStep <= 2.5
          ? 2.5
          : chartNormalizedStep <= 5
            ? 5
            : 10) * chartMagnitude;
  const chartMax = Math.max(chartStepSize * 4, 1);
  const ordersPeak = dailySales.reduce(
    (peak, day) => Math.max(peak, day.orders),
    0,
  );
  const ordersMax = Math.max(4, Math.ceil(ordersPeak / 4) * 4);
  const chartStep = Math.max(1, Math.ceil(dailySales.length / 5));
  const chartPoints = dailySales.map((day, index) => ({
    ...day,
    x: 58 + (index * 824) / Math.max(dailySales.length - 1, 1),
    salesY: 170 - (day.sales / chartMax) * 142,
    profitY: 170 - (day.profit / chartMax) * 142,
    ordersY: 170 - (day.orders / ordersMax) * 142,
  }));
  const smoothPath = (valueKey) => {
    if (!chartPoints.length) return "";
    let path = `M ${chartPoints[0].x} ${chartPoints[0][valueKey]}`;
    for (let index = 0; index < chartPoints.length - 1; index += 1) {
      const current = chartPoints[index];
      const next = chartPoints[index + 1];
      const previous = chartPoints[index - 1] || current;
      const afterNext = chartPoints[index + 2] || next;
      const currentY = current[valueKey];
      const nextY = next[valueKey];
      const minY = Math.min(currentY, nextY);
      const maxY = Math.max(currentY, nextY);
      const controlOneX = current.x + (next.x - previous.x) / 6;
      const controlOneY = Math.max(
        minY,
        Math.min(maxY, currentY + (nextY - previous[valueKey]) / 6),
      );
      const controlTwoX = next.x - (afterNext.x - current.x) / 6;
      const controlTwoY = Math.max(
        minY,
        Math.min(maxY, nextY - (afterNext[valueKey] - currentY) / 6),
      );
      path += ` C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${next.x} ${nextY}`;
    }
    return path;
  };
  const salesWavePath = smoothPath("salesY");
  const profitWavePath = smoothPath("profitY");
  const ordersWavePath = smoothPath("ordersY");
  const waveAreaPath = salesWavePath
    ? `${salesWavePath} L ${chartPoints[chartPoints.length - 1].x} 170 L ${chartPoints[0].x} 170 Z`
    : "";
  const productMetricOptions = [
    { id: "quantity", label: "Units sold", format: (product) => `${product.quantity} units` },
    { id: "revenue", label: "Sales", format: (product) => money(product.revenue) },
    { id: "profit", label: "Profit", format: (product) => money(product.profit) },
  ];
  const selectedProductMetric = productMetricOptions.find((metric) => metric.id === productMetric);
  const paymentMethods = analytics?.paymentMethods || [];
  const paymentCircumference = 2 * Math.PI * 37;
  const paymentSegments = paymentMethods.map((payment, index) => {
    const ordersBefore = paymentMethods
      .slice(0, index)
      .reduce((sum, previous) => sum + previous.orders, 0);
    const length =
      (payment.orders / Math.max(analytics?.summary.orders || 0, 1)) *
      paymentCircumference;
    const segment = {
      ...payment,
      color: ["#4f8d65", "#d0a45f", "#6d91ad"][index % 3],
      length,
      offset:
        (ordersBefore / Math.max(analytics?.summary.orders || 0, 1)) *
        paymentCircumference,
    };
    return segment;
  });
  const topProducts = [...(analytics?.products || [])]
    .sort((a, b) => b[productMetric] - a[productMetric])
    .slice(0, 8);
  const productChartMax = Math.max(1, ...topProducts.map((product) => product[productMetric]));
  async function exportAnalytics() {
    if (!analytics || analyticsLoading || analyticsExporting) return;
    setAnalyticsExporting(true);
    setAnalyticsError("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "The Counter";
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet("Daily Profit", {
        views: [{ state: "frozen", ySplit: 4 }],
      });
      worksheet.columns = [
        { header: "Date", key: "date", width: 18 },
        { header: "Orders", key: "orders", width: 12 },
        { header: "Units sold", key: "unitsSold", width: 14 },
        { header: "Sales (before tax)", key: "sales", width: 23 },
        { header: "Gross profit", key: "profit", width: 19 },
        { header: "Profit data", key: "profitData", width: 34 },
      ];
      worksheet.mergeCells("A1:F1");
      worksheet.getCell("A1").value = "Daily sales and gross profit";
      worksheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
      worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176B5B" } };
      worksheet.getCell("A1").alignment = { vertical: "middle" };
      worksheet.getRow(1).height = 30;
      worksheet.mergeCells("A2:F2");
      worksheet.getCell("A2").value = `Period: ${analyticsRange.from} to ${analyticsRange.to}`;
      worksheet.getCell("A2").font = { bold: true, color: { argb: "FF344A3B" } };
      worksheet.mergeCells("A3:F3");
      worksheet.getCell("A3").value = "Green = positive profit · Red = loss · Amber = some units have no saved cost; shaded bands alternate by week.";
      worksheet.getCell("A3").font = { italic: true, size: 10, color: { argb: "FF69776C" } };
      const header = worksheet.getRow(4);
      header.values = ["Date", "Orders", "Units sold", "Sales (before tax)", "Gross profit", "Profit data"];
      header.height = 24;
      header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF315D4D" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      analytics.dailySales.forEach((day, index) => {
        const row = worksheet.addRow({
          date: new Date(`${day.date}T00:00:00.000Z`),
          orders: day.orders,
          unitsSold: day.unitsSold,
          sales: day.sales,
          profit: day.profit,
          profitData: day.unitsWithoutCost
            ? `Partial · ${day.unitsWithoutCost} unit(s) without saved cost`
            : "Complete",
        });
        const band = Math.floor(index / 7) % 2 === 0 ? "FFF1F8F5" : "FFF2F3FC";
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: band } };
          cell.alignment = { vertical: "middle" };
        });
        row.getCell("date").numFmt = "dd mmm yyyy";
        row.getCell("date").font = { bold: true, color: { argb: "FF385B4B" } };
        row.getCell("sales").numFmt = '₹#,##0.00;[Red]-₹#,##0.00';
        row.getCell("sales").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5F2ED" } };
        row.getCell("profit").numFmt = '₹#,##0.00;[Red]-₹#,##0.00';
        const profitColor = day.unitsWithoutCost
          ? "FFFFF0CC"
          : day.profit < 0
            ? "FFFCE2E0"
            : "FFDDF2E2";
        row.getCell("profit").fill = { type: "pattern", pattern: "solid", fgColor: { argb: profitColor } };
        row.getCell("profit").font = { bold: true, color: { argb: day.unitsWithoutCost ? "FF80601C" : day.profit < 0 ? "FF9B332E" : "FF23613B" } };
        if (day.unitsWithoutCost) row.getCell("profitData").font = { color: { argb: "FF80601C" } };
        if (index % 7 === 0) {
          row.getCell("date").border = { top: { style: "medium", color: { argb: "FF9BBEAA" } } };
        }
      });
      const totalRow = worksheet.addRow({
        date: "TOTAL",
        orders: analytics.summary.orders,
        unitsSold: analytics.summary.unitsSold,
        sales: analytics.summary.revenue,
        profit: analytics.summary.profit,
        profitData: analytics.summary.unitsWithoutCost
          ? `Partial · ${analytics.summary.unitsWithoutCost} unit(s) without saved cost`
          : "Complete",
      });
      totalRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF315D4D" } };
      });
      totalRow.getCell("sales").numFmt = '₹#,##0.00;[Red]-₹#,##0.00';
      totalRow.getCell("profit").numFmt = '₹#,##0.00;[Red]-₹#,##0.00';
      worksheet.autoFilter = { from: "A4", to: `F${worksheet.rowCount - 1}` };
      const buffer = await workbook.xlsx.writeBuffer();
      const downloadUrl = URL.createObjectURL(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `analytics-${analyticsRange.from}-to-${analyticsRange.to}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      setAnalyticsError(`Excel export failed: ${error.message}`);
    } finally {
      setAnalyticsExporting(false);
    }
  }
  return (
    <div
      className={`app-shell ${view === "billing" && orderIds ? "order-mode" : ""}`}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src="/counter-logo.svg" alt="The Counter" />
          </div>
          <div>
            <strong>
              the counter<span>.</span>
            </strong>
            <small>{admin ? "ADMIN WORKSPACE" : "STAFF WORKSPACE"}</small>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                if (id === "billing") startOrder();
                else {
                  if (id === "analytics") {
                    setAnalyticsLoading(
                      Boolean(
                        analyticsRange.from &&
                          analyticsRange.to &&
                          analyticsRange.from <= analyticsRange.to,
                      ),
                    );
                    setAnalyticsError("");
                  }
                  if (id === "settings") setSettingsDraft(settings);
                  setView(id);
                  setNotice("");
                }
              }}
              className={`nav-item ${view === id ? "selected" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              {view === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-box">
            <div className="help-icon">
              <CircleHelp size={17} />
            </div>
            <strong>Made for your everyday.</strong>
            <p>All the little things that keep your store moving.</p>
            {!admin && (
              <button
                className="help-shortcuts"
                onClick={() => setShowShortcuts(true)}
              >
                Keyboard shortcuts <span>?</span>
              </button>
            )}
          </div>
          <div className="account">
            <div className="avatar">
              {(profile?.name || (admin ? "Admin" : "Staff"))
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <div>
              <strong>
                {profile?.name || (admin ? "Store Admin" : "Staff")}
              </strong>
              <small>{admin ? "Administrator" : "Counter staff"}</small>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              onClick={signOut}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>{nav.find((item) => item.id === view)?.label}</strong>
          </div>
          <div className="top-right">
            <span className="status-dot" />{" "}
            Store online{" "}
            <span className="top-divider" /> <span>{today}</span>
            <div className="avatar small">
              {(profile?.name || "A").slice(0, 1).toUpperCase()}
            </div>
            <button
              className="icon-button mobile-signout"
              title="Sign out"
              onClick={signOut}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {notice && (
          <div className="notice-bar">
            <span>{notice}</span>
            <button
              className="icon-button"
              onClick={() => setNotice("")}
              title="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        )}
        {view === "billing" && orderIds && (
          <div className="billing-layout">
            <section className="catalog">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="tiny-diamond">✦</span> COUNTER / 01
                  </div>
                  <h1>
                    Build an order<span className="heading-dot">.</span>
                  </h1>
                  <p>Choose items from your live store inventory.</p>
                </div>
                <div className="order-identifiers">
                  <div>
                    <span>ORDER ID</span>
                    <strong>{orderIds.order_code}</strong>
                  </div>
                  <div>
                    <span>CUSTOMER ID</span>
                    <strong>{orderIds.customer_code}</strong>
                  </div>
                </div>
              </div>
              <div className="catalog-heading">
                <div>
                  <h2>Store inventory</h2>
                  <p>Select any row to add an item to this order.</p>
                </div>
                <div className="catalog-tools">
                  <span className="item-label">{activeProducts.length} PRODUCTS</span>
                  <button
                    className="keyboard-help-button"
                    onClick={() => setShowShortcuts(true)}
                    aria-label="Show keyboard shortcuts"
                  >
                    <CircleHelp size={14} /> Shortcuts
                  </button>
                </div>
              </div>
              <div className="search-box">
                <Search size={18} />
                <input
                  ref={searchInputRef}
                  placeholder="Search by product name or SKU..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <span className="shortcut-key" aria-hidden="true">/</span>
              </div>
              <p className="keyboard-hint">
                <kbd>↑</kbd> <kbd>↓</kbd> browse products <kbd>Enter</kbd> add to sale
              </p>
              <div className="product-sections">
                {productSections.map((section) => {
                  const sectionProducts = visibleProducts.filter(
                    (product) => sectionForProduct(product) === section,
                  );
                  const foodCategoryGroups = [
                    ...sectionProducts.reduce((groups, product) => {
                      const category = product.category?.trim() || "Uncategorized";
                      groups.set(category, [...(groups.get(category) || []), product]);
                      return groups;
                    }, new Map()),
                  ].sort(([left], [right]) => left.localeCompare(right));
                  const groupedProducts =
                    section === "Other food items"
                      ? foodCategoryGroups.length
                        ? foodCategoryGroups
                        : [["", []]]
                      : [["", sectionProducts]];
                  return (
                    <section className="product-section" key={section}>
                      <div className="product-section-heading">
                        <h2>{section}</h2>
                        <span>{sectionProducts.length} ITEMS</span>
                      </div>
                      {groupedProducts.map(([category, categoryProducts]) => (
                        <div className="category-product-group" key={category || section}>
                          {category && <h3>{category}</h3>}
                          <div className="item-sheet-wrap">
                            <table className="item-sheet">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>ITEM</th>
                                  <th>SKU</th>
                                  <th>PRICE</th>
                                  <th>QTY</th>
                                  <th aria-label="Add item" />
                                </tr>
                              </thead>
                              <tbody>
                                {categoryProducts.map((product, index) => (
                                  <tr key={product.id}>
                                    <td className="sheet-row-number">{index + 1}</td>
                                    <td className="sheet-item-name">
                                      {product.brand
                                        ? `${product.brand} - ${product.name}`
                                        : product.name}
                                    </td>
                                    <td>{product.sku || "—"}</td>
                                    <td>{money(product.price)}</td>
                                    <td>{product.stock}</td>
                                    <td>
                                      <button
                                        className="sheet-add"
                                        data-product-index={visibleProducts.findIndex((item) => item.id === product.id)}
                                        title={`Add ${product.name} to order`}
                                        aria-label={`Add ${product.name} to order`}
                                        onClick={() => addProduct(product)}
                                        disabled={Number(product.stock) <= 0}
                                      >
                                        <Plus size={15} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {!sectionProducts.length && (
                                  <tr>
                                    <td className="sheet-empty" colSpan={6}>
                                      {search
                                        ? "No matching products."
                                        : "No products in this section yet."}
                                      {admin && " Add products from the Products tab."}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
              <div className="catalog-footer">
                <span>
                  <span className="status-dot" /> Inventory ready
                </span>
              </div>
            </section>
            <aside className="checkout checkout-workspace">
              <div className="checkout-workspace-head">
                <div>
                  <p className="eyebrow">CHECKOUT</p>
                  <h2>Review sale</h2>
                </div>
                <button
                  className="checkout-cancel"
                  title="Cancel order"
                  onClick={() => setConfirmAction("cancel")}
                >
                  <X size={16} />
                  <span>Cancel</span>
                </button>
              </div>
              <div className="checkout-customer-row">
                <div className="checkout-customer-id">
                  <span>CUSTOMER ID</span>
                  <strong>{orderIds.customer_code}</strong>
                </div>
                <label className="checkout-customer-field">
                  <span>Customer name <small>OPTIONAL</small></span>
                  <input
                    placeholder="Customer name"
                    value={customer}
                    onChange={(event) => setCustomer(event.target.value)}
                    maxLength={100}
                  />
                </label>
                <label className="checkout-customer-field checkout-phone-field">
                  <span>Mobile number <small>OPTIONAL</small></span>
                  <input
                    id="customer-mobile"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    pattern="[6-9][0-9]{9}"
                    placeholder="10-digit mobile number"
                    value={customerPhone}
                    aria-invalid={Boolean(customerPhoneError)}
                    aria-describedby={customerPhoneError ? "customer-mobile-error" : undefined}
                    onChange={(event) => {
                      setCustomerPhone(event.target.value.replace(/\D/g, "").slice(0, 10));
                      setCustomerPhoneError("");
                    }}
                  />
                  {customerPhoneError && (
                    <span className="field-error" id="customer-mobile-error">{customerPhoneError}</span>
                  )}
                </label>
              </div>
              <div className="checkout-items-head">
                <div>
                  <h3>Items</h3>
                  <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
                </div>
                <span>AMOUNT</span>
              </div>
              <div className="checkout-lines">
                {cart.length === 0 ? (
                  <div className="checkout-empty">
                    <div className="checkout-empty-icon">
                      <ShoppingBag size={22} strokeWidth={1.6} />
                    </div>
                    <strong>Your sale is empty</strong>
                    <p>Select a product to add it to this order.</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div className="checkout-line" key={item.id}>
                      <div className="checkout-line-copy">
                        <strong>{item.name}</strong>
                        <span>
                          {item.brand ? `${item.brand} - ` : ""}
                          {money(item.price)} each
                        </span>
                      </div>
                      <div className="checkout-line-actions">
                        <div className="checkout-quantity">
                          <button
                            title="Decrease quantity"
                            aria-label={`Decrease ${item.name} quantity`}
                            onClick={() => changeQuantity(item.id, -1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus size={13} />
                          </button>
                          <input
                            className="checkout-quantity-input"
                            type="number"
                            min="1"
                            max={item.stock}
                            step="1"
                            inputMode="numeric"
                            aria-label={`${item.name} quantity`}
                            value={quantityDrafts[item.id] ?? item.quantity}
                            onChange={(event) => editQuantity(item.id, event.target.value)}
                            onBlur={() => finishQuantityEdit(item.id)}
                          />
                          <button
                            title="Increase quantity"
                            aria-label={`Increase ${item.name} quantity`}
                            onClick={() => changeQuantity(item.id, 1)}
                            disabled={item.quantity >= Number(item.stock)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <strong>{money(item.price * item.quantity)}</strong>
                        <button
                          className="checkout-remove-item"
                          type="button"
                          title={`Remove ${item.name} from this order`}
                          aria-label={`Remove ${item.name} from this order`}
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="checkout-payment-panel">
                <div className="checkout-totals">
                  <div className="checkout-total-line">
                    <span>Subtotal <small>({itemCount} items)</small></span>
                    <strong>{money(subtotal)}</strong>
                  </div>
                  <div className="checkout-total-line">
                    <span>GST {settings.gst_enabled ? `(${settings.gst_rate}%, cigarettes excluded)` : "(off)"}</span>
                    <strong>{money(tax)}</strong>
                  </div>
                  <div className="checkout-grand-total">
                    <span>Total <small>Amount to pay</small></span>
                    <strong>{money(total)}</strong>
                  </div>
                </div>
                <div className="checkout-payment-title">Payment method</div>
                <div className="checkout-payment-options">
                  {[
                    { name: "Cash", icon: Wallet },
                    { name: "UPI", icon: BadgeIndianRupee },
                    { name: "Card", icon: CreditCard },
                  ].map(({ name, icon: Icon }) => (
                    <button
                      key={name}
                      onClick={() => setPayment(name)}
                      className={payment === name ? "active" : ""}
                    >
                      <Icon size={16} />
                      {name}
                    </button>
                  ))}
                </div>
                <button
                  className="button primary checkout-submit"
                  onClick={requestOrderConfirmation}
                  disabled={!cart.length || busy}
                >
                  {busy ? "Placing order..." : "Place order"}
                  <ArrowRight size={17} />
                </button>
                <div className="checkout-save-note">
                  <Check size={14} />
                  Sale saved securely
                </div>
              </div>
            </aside>
          </div>
        )}
        {view === "analytics" && admin && (
          <section className="page-content analytics-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">STORE PERFORMANCE</div>
                <h1>
                  Analytics<span className="heading-dot">.</span>
                </h1>
                <p>Sales, products sold and profit from recorded manufacturing costs.</p>
              </div>
              <div className="analytics-header-tools">
                <div className="analytics-date-range">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      aria-label="Analytics start date"
                      value={analyticsRange.from}
                      onChange={(event) => {
                        setAnalyticsDays(null);
                        setAnalyticsLoading(Boolean(event.target.value && analyticsRange.to && event.target.value <= analyticsRange.to));
                        setAnalyticsError("");
                        setAnalyticsRange((current) => ({ ...current, from: event.target.value }));
                      }}
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      aria-label="Analytics end date"
                      value={analyticsRange.to}
                      onChange={(event) => {
                        setAnalyticsDays(null);
                        setAnalyticsLoading(Boolean(analyticsRange.from && event.target.value && analyticsRange.from <= event.target.value));
                        setAnalyticsError("");
                        setAnalyticsRange((current) => ({ ...current, to: event.target.value }));
                      }}
                    />
                  </label>
                </div>
                <div className="analytics-period" aria-label="Quick analytics date range">
                  {[7, 30, 90].map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={analyticsDays === days ? "active" : ""}
                      onClick={() => {
                        const to = toUtcDateInput(new Date());
                        setAnalyticsLoading(true);
                        setAnalyticsError("");
                        setAnalyticsDays(days);
                        setAnalyticsRange({ from: shiftUtcDateInput(to, 1 - days), to });
                      }}
                      aria-pressed={analyticsDays === days}
                    >
                      {days} days
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="button secondary analytics-export"
                  onClick={exportAnalytics}
                  disabled={!analytics || analyticsLoading || analyticsExporting || Boolean(analyticsRangeError || analyticsError)}
                >
                  <Download size={15} />
                  {analyticsExporting ? "Preparing..." : "Download Excel"}
                </button>
              </div>
            </div>
            {(analyticsRangeError || analyticsError) && (
              <p className="analytics-error">{analyticsRangeError || analyticsError}</p>
            )}
            <div className="analytics-stats">
              <article>
                <span>SALES (BEFORE TAX)</span>
                <strong>{money(analytics?.summary.revenue)}</strong>
                <small>{analytics?.summary.orders || 0} orders in this period</small>
              </article>
              <article>
                <span>GROSS PROFIT</span>
                <strong>{money(analytics?.summary.profit)}</strong>
                <small>Based on saved manufacturing costs</small>
              </article>
              <article>
                <span>PRODUCTS SOLD</span>
                <strong>{(analytics?.summary.unitsSold || 0).toLocaleString("en-IN")}</strong>
                <small>Individual units in this period</small>
              </article>
              <article>
                <span>AVERAGE ORDER</span>
                <strong>{money(analytics?.summary.averageOrderValue)}</strong>
                <small>Average sales value per order</small>
              </article>
              <article>
                <span>BEST SALES DAY</span>
                <strong className="analytics-best-day">
                  {analytics?.summary.bestDay
                    ? money(analytics.summary.bestDay.sales)
                    : "—"}
                </strong>
                <small>
                  {analytics?.summary.bestDay
                    ? `${new Date(`${analytics.summary.bestDay.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${analytics.summary.bestDay.orders} ${analytics.summary.bestDay.orders === 1 ? "order" : "orders"}`
                    : "No sales in this period"}
                </small>
              </article>
            </div>
            <section className="analytics-panel">
              <div className="analytics-panel-heading">
                <div>
                  <h2>Sales & orders trend</h2>
                  <p>Daily sales, gross profit and orders · {analyticsRange.from} to {analyticsRange.to}</p>
                </div>
                <div className="analytics-chart-tools">
                  {analyticsSeries.sales && chartPeakValue > 0 && (
                    <span className="chart-peak-pill">
                      <i />
                      Peak{" "}
                      {new Date(`${chartPeak.date}T00:00:00`).toLocaleDateString(
                        "en-IN",
                        {day: "numeric", month: "short"},
                      )}
                      <strong>{money(chartPeakValue)}</strong>
                    </span>
                  )}
                  {analyticsLoading && <span>Updating...</span>}
                  <div className="sales-chart-legend" aria-label="Toggle chart series">
                    <button
                      type="button"
                      className={analyticsSeries.sales ? "active" : ""}
                      disabled={analyticsSeries.sales && Object.values(analyticsSeries).filter(Boolean).length === 1}
                      aria-pressed={analyticsSeries.sales}
                      onClick={() =>
                        setAnalyticsSeries((current) => {
                          const next = { ...current, sales: !current.sales };
                          return Object.values(next).some(Boolean) ? next : current;
                        })
                      }
                    >
                      <i className="sales-legend-dot" /> Sales
                    </button>
                    <button
                      type="button"
                      className={analyticsSeries.orders ? "active" : ""}
                      disabled={analyticsSeries.orders && Object.values(analyticsSeries).filter(Boolean).length === 1}
                      aria-pressed={analyticsSeries.orders}
                      onClick={() =>
                        setAnalyticsSeries((current) => {
                          const next = { ...current, orders: !current.orders };
                          return Object.values(next).some(Boolean) ? next : current;
                        })
                      }
                    >
                      <i className="orders-legend-dot" /> Orders
                    </button>
                    <button
                      type="button"
                      className={analyticsSeries.profit ? "active" : ""}
                      disabled={analyticsSeries.profit && Object.values(analyticsSeries).filter(Boolean).length === 1}
                      aria-pressed={analyticsSeries.profit}
                      onClick={() =>
                        setAnalyticsSeries((current) => {
                          const next = { ...current, profit: !current.profit };
                          return Object.values(next).some(Boolean) ? next : current;
                        })
                      }
                    >
                      <i className="profit-legend-dot" /> Profit
                    </button>
                  </div>
                </div>
              </div>
              <div className="sales-chart-wrap">
                <svg
                  className="sales-chart"
                  viewBox="0 0 940 270"
                  role="img"
                  aria-label={`Daily ${[
                    analyticsSeries.sales && "sales",
                    analyticsSeries.orders && "orders",
                    analyticsSeries.profit && "profit",
                  ].filter(Boolean).join(" and ")} from ${analyticsRange.from} to ${analyticsRange.to}`}
                >
                  <defs>
                    <linearGradient id="sales-wave-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#188b7e" stopOpacity=".24" />
                      <stop offset="58%" stopColor="#188b7e" stopOpacity=".09" />
                      <stop offset="100%" stopColor="#188b7e" stopOpacity=".015" />
                    </linearGradient>
                    <linearGradient id="sales-wave-line" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#087d75" />
                      <stop offset="100%" stopColor="#126a60" />
                    </linearGradient>
                    <linearGradient id="orders-wave-line" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#d39945" />
                      <stop offset="100%" stopColor="#b87427" />
                    </linearGradient>
                    <linearGradient id="profit-wave-line" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#7184c7" />
                      <stop offset="100%" stopColor="#5368ae" />
                    </linearGradient>
                    <clipPath id="sales-chart-clip">
                      <rect x="52" y="20" width="842" height="158" rx="4" />
                    </clipPath>
                  </defs>
                  {[0, 1, 2, 3, 4].map((line) => {
                    const y = 28 + line * 35.5;
                    return (
                      <g key={line}>
                        <line className="sales-chart-grid" x1="58" y1={y} x2="882" y2={y} />
                        {(analyticsSeries.sales || analyticsSeries.profit) && (
                          <text className="sales-chart-axis" x="50" y={y + 3.5} textAnchor="end">
                            {money((chartMax * (4 - line)) / 4).replace(".00", "")}
                          </text>
                        )}
                        {analyticsSeries.orders && (
                          <text className="orders-chart-axis" x="892" y={y + 3.5} textAnchor="start">
                            {Math.round((ordersMax * (4 - line)) / 4).toLocaleString("en-IN")}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <g clipPath="url(#sales-chart-clip)">
                    {analyticsSeries.sales && waveAreaPath && (
                      <path className="sales-chart-area" d={waveAreaPath} />
                    )}
                    {analyticsSeries.sales && salesWavePath && (
                      <path className="sales-chart-wave sales-series" d={salesWavePath} pathLength="1000" />
                    )}
                    {analyticsSeries.orders && ordersWavePath && (
                      <path className="sales-chart-wave orders-series" d={ordersWavePath} pathLength="1000" />
                    )}
                    {analyticsSeries.profit && profitWavePath && (
                      <path className="sales-chart-wave profit-series" d={profitWavePath} pathLength="1000" />
                    )}
                  </g>
                  {chartPoints.map((point, index) => {
                    const labelDate = new Date(`${point.date}T00:00:00`).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    });
                    return (
                      <g key={point.date} className="sales-chart-point">
                        <title>{`${labelDate}: ${money(point.sales)} sales · ${money(point.profit)} gross profit · ${point.orders} ${point.orders === 1 ? "order" : "orders"}`}</title>
                        {analyticsSeries.sales && (
                          <circle className="sales-point" cx={point.x} cy={point.salesY} r="4.5" />
                        )}
                        {analyticsSeries.orders && (
                          <circle className="orders-point" cx={point.x} cy={point.ordersY} r="4" />
                        )}
                        {analyticsSeries.profit && (
                          <circle className="profit-point" cx={point.x} cy={point.profitY} r="3.5" />
                        )}
                        {(index % chartStep === 0 || index === chartPoints.length - 1) && (
                          <text className="sales-chart-date" x={point.x} y="222" textAnchor="middle">
                            {labelDate}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </section>
            <section className="analytics-panel payment-performance">
              <div className="analytics-panel-heading">
                <div>
                  <h2>Payment breakdown</h2>
                  <p>Orders and order totals, including tax, by payment method</p>
                </div>
              </div>
              {paymentMethods.length ? (
                <div className="payment-breakdown">
                  <div className="payment-donut-wrap">
                    <svg
                      className="payment-donut"
                      viewBox="0 0 100 100"
                      role="img"
                      aria-label="Payment method share by order count"
                    >
                      <circle className="payment-donut-track" cx="50" cy="50" r="37" />
                      {paymentSegments.map((segment) => (
                        <circle
                          key={segment.method}
                          className="payment-donut-segment"
                          cx="50"
                          cy="50"
                          r="37"
                          stroke={segment.color}
                          strokeDasharray={`${segment.length} ${paymentCircumference - segment.length}`}
                          strokeDashoffset={-segment.offset}
                        >
                          <title>
                            {`${segment.method}: ${segment.orders} orders (${segment.share}%)`}
                          </title>
                        </circle>
                      ))}
                      <text className="payment-donut-total" x="50" y="47" textAnchor="middle">
                        {analytics?.summary.orders || 0}
                      </text>
                      <text className="payment-donut-caption" x="50" y="59" textAnchor="middle">
                        ORDERS
                      </text>
                    </svg>
                  </div>
                  <div className="payment-breakdown-list">
                    {paymentSegments.map((segment) => (
                      <div className="payment-breakdown-row" key={segment.method}>
                        <span className="payment-breakdown-method">
                          <i style={{ backgroundColor: segment.color }} />
                          {segment.method}
                        </span>
                        <span className="payment-breakdown-count">
                          {segment.orders} · {segment.share}%
                        </span>
                        <strong>{money(segment.amount)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="analytics-empty">Payment details will appear when orders are recorded.</p>
              )}
            </section>
            {analytics?.summary.unitsWithoutCost > 0 && (
              <p className="analytics-note">
                Profit is unavailable for {analytics.summary.unitsWithoutCost} units sold before manufacturing costs were recorded. New sales use the cost saved with each product at checkout.
              </p>
            )}
            <section className="analytics-panel product-performance">
              <div className="analytics-panel-heading">
                <div>
                  <h2>Product performance</h2>
                  <p>Top products at a glance. Choose what to compare.</p>
                </div>
                <div className="analytics-period product-metric-switch" aria-label="Product graph metric">
                  {productMetricOptions.map((metric) => (
                    <button
                      key={metric.id}
                      className={productMetric === metric.id ? "active" : ""}
                      onClick={() => setProductMetric(metric.id)}
                      aria-pressed={productMetric === metric.id}
                    >
                      {metric.label}
                    </button>
                  ))}
                </div>
              </div>
              {topProducts.length > 0 && (
                <div className="product-chart" role="img" aria-label={`Top products by ${selectedProductMetric.label.toLowerCase()}`}>
                  {topProducts.map((product, index) => (
                    <div className="product-chart-row" key={product.product_id}>
                      <div className="product-chart-label">
                        <span className="product-chart-rank">{String(index + 1).padStart(2, "0")}</span>
                        <strong title={product.name}>{product.name}</strong>
                        <span className="product-chart-value">{selectedProductMetric.format(product)}</span>
                      </div>
                      <div className="product-chart-track">
                        <div
                          className={`product-chart-bar product-chart-bar-${index % 4}`}
                          style={{ width: `${Math.max(2, (product[productMetric] / productChartMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>PRODUCT</th>
                      <th>UNITS SOLD</th>
                      <th>SALES</th>
                      <th>GROSS PROFIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.products || []).map((product) => (
                      <tr key={product.product_id}>
                        <td><strong>{product.name}</strong></td>
                        <td>{product.quantity}</td>
                        <td>{money(product.revenue)}</td>
                        <td>
                          {money(product.profit)}
                          {product.unitsWithoutCost > 0 && (
                            <small className="unavailable-profit">
                              {product.unitsWithoutCost} units without cost
                            </small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!analyticsLoading && !analytics?.products.length && (
                  <div className="table-empty">No sales recorded in this period.</div>
                )}
              </div>
            </section>
          </section>
        )}
        {view === "sales" && (
          <section className="page-content orders-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {admin ? "YOUR STORE AT A GLANCE" : "YOUR COUNTER"}
                </div>
                <h1>
                  {admin ? "All orders" : "My orders"}
                  <span className="heading-dot">.</span>
                </h1>
                <p>
                  {admin
                    ? "Keep track of every order."
                    : "Confirm payment, prepare, and hand over."}
                </p>
              </div>
              {!admin && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={startOrder}
                >
                  <Plus size={17} /> Create order
                </button>
              )}
            </div>
            <div className="stats-row orders-stats">
              <div>
                <span>ORDERS</span>
                <strong>{sales.length}</strong>
                <small>Recent orders</small>
                <ReceiptText size={20} />
              </div>
              <div>
                <span>PAYMENT CONFIRMED</span>
                <strong>
                  {money(
                    sales
                      .filter(
                        (sale) =>
                          sale.status !== "pending_payment" &&
                          sale.status !== "cancelled",
                      )
                      .reduce((sum, sale) => sum + Number(sale.total), 0),
                  )}
                </strong>
                <small>Recent paid orders</small>
                <BarChart3 size={20} />
              </div>
              <div>
                <span>IN PREPARATION</span>
                <strong>
                  {sales.filter((sale) => sale.status === "preparing").length}
                </strong>
                <small>Awaiting handover</small>
                <Package size={20} />
              </div>
            </div>
            <div className="section-title order-section-title">
              <div>
                <h2>Recent orders</h2>
                <p>Showing up to 100 of your latest orders.</p>
              </div>
              <span className="order-count">
                {sales.length} {sales.length === 1 ? "order" : "orders"}
              </span>
            </div>
            <div className="table-wrap orders-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ORDER ID</th>
                    <th>CUSTOMER ID</th>
                    <th>DATE</th>
                    <th>CUSTOMER</th>
                    <th>PAYMENT</th>
                    <th>TOTAL</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>
                        <strong className="order-code">
                          {sale.order_code || `#${sale.id}`}
                        </strong>
                      </td>
                      <td>
                        <strong className="customer-code">
                          {sale.customer_code || "—"}
                        </strong>
                      </td>
                      <td className="order-date">{date(sale.created_at)}</td>
                      <td>
                        <div className="order-customer">
                          <span className="customer-avatar">
                            {(sale.customer || "Walk-in customer")
                              .trim()
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")
                              .toUpperCase()}
                          </span>
                          <span className="customer-details">
                            <strong>{sale.customer || "Walk-in customer"}</strong>
                            {sale.customer_phone && (
                              <small className="customer-phone-value">
                                {sale.customer_phone}
                              </small>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="order-payment">
                          {sale.payment_method?.toLowerCase() === "card" ? (
                            <CreditCard size={14} />
                          ) : (
                            <Wallet size={14} />
                          )}
                          {sale.payment_method}
                        </span>
                      </td>
                      <td>
                        <strong className="order-total">{money(sale.total)}</strong>
                      </td>
                      <td>
                        <span
                          key={sale.status}
                          aria-live="polite"
                          className={`pill order-status status-${sale.status} ${sale.status === "completed" ? "good" : ""}`}
                        >
                          <span className="status-indicator" />
                          {orderLabels[sale.status] || sale.status}
                        </span>
                      </td>
                      <td>
                        <div className="order-actions">
                          {!admin && sale.status !== "completed" && (
                            <>
                              {sale.status !== "cancelled" && (
                                <>
                                  <button
                                    className="text-button order-action-button"
                                    disabled={busy}
                                    aria-live="polite"
                                    onClick={() => advanceOrder(sale)}
                                  >
                                    {orderAction?.id === sale.id ? (
                                      <>
                                        <span
                                          className="order-action-spinner"
                                          aria-hidden="true"
                                        />
                                        {orderAction.next === "preparing"
                                          ? "Confirming payment..."
                                          : "Completing order..."}
                                      </>
                                    ) : sale.status === "pending_payment" ? (
                                      "Confirm payment"
                                    ) : (
                                      "Handed over · complete"
                                    )}
                                  </button>
                                  <button
                                    className="icon-button order-edit-button"
                                    title="Edit order items"
                                    aria-label={`Edit items in order ${sale.order_code || sale.id}`}
                                    disabled={busy}
                                    onClick={() => startEditingSale(sale)}
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  <button
                                    className="icon-button order-cancel-button"
                                    title="Cancel order and restore stock"
                                    aria-label={`Cancel order ${sale.order_code || sale.id}`}
                                    disabled={busy}
                                    onClick={() => setCancelSaleTarget(sale)}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                          <button
                            className="icon-button"
                            title="View order receipt"
                            onClick={() => setReceipt(sale)}
                          >
                            <ReceiptText size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sales.length && (
                <div className="table-empty">No orders yet.</div>
              )}
            </div>
          </section>
        )}
        {view === "products" && (
          <section className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">YOUR INVENTORY</div>
                <h1>
                  Products<span className="heading-dot">.</span>
                </h1>
                <p>Keep your shelves and your counter in sync.</p>
              </div>
              <div className="category-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    setCategoryName("");
                    setCategoryError("");
                    setCategoryForm(true);
                  }}
                >
                  <Plus size={17} /> Add food category
                </button>
                <button
                  className="button primary"
                  onClick={() => setProductForm(emptyProduct)}
                >
                  <Plus size={17} /> Add product
                </button>
              </div>
            </div>
            <div className="section-title">
              <div>
                <h2>All products</h2>
                <p>{products.length} products in your catalogue</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PRODUCT</th>
                    <th>SKU</th>
                    <th>BRAND / CATEGORY</th>
                    <th>SELLING PRICE</th>
                    <th>MANUFACTURING COST</th>
                    <th>STOCK</th>
                    <th>STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr key={product.id}>
                      <td>
                        <div className="table-product">
                          <div
                            className={`cart-thumb ${tones[index % tones.length]}`}
                          >
                            <Package size={17} />
                          </div>
                          <strong>{product.name}</strong>
                        </div>
                      </td>
                      <td>{product.sku || "—"}</td>
                      <td>
                        {sectionForProduct(product) === "Cigarettes"
                          ? product.brand || "Cigarettes"
                          : [product.category, product.subcategory]
                              .filter(Boolean)
                              .join(" / ") || "General"}
                      </td>
                      <td>{money(product.price)}</td>
                      <td>
                        {product.cost_price == null
                          ? "Not set"
                          : money(product.cost_price)}
                      </td>
                      <td>{product.stock}</td>
                      <td>
                        <span
                          className={`pill ${product.active ? "good" : ""}`}
                        >
                          {product.active ? "Active" : "Hidden"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setProductForm(product)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!products.length && (
                <div className="table-empty">
                  No products yet. Add your first product to start billing.
                </div>
              )}
            </div>
          </section>
        )}
        {view === "staff" && (
          <section className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">THE PEOPLE BEHIND THE COUNTER</div>
                <h1>
                  Staff access<span className="heading-dot">.</span>
                </h1>
                <p>Manage who can sign in to your store.</p>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  setStaffForm({ name: "", username: "", password: "" })
                  setStaffFormError("");
                  setStaffTouched({});
                }}
              >
                <Plus size={17} /> Add staff
              </button>
            </div>
            <div className="section-title">
              <div>
                <h2>Team members</h2>
                <p>Counter staff can create and manage their own orders.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>NAME</th>
                    <th>USERNAME / EMAIL</th>
                    <th>ROLE</th>
                    <th>STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <strong>{person.name}</strong>
                      </td>
                      <td>
                        {person.email.endsWith("@counter.local")
                          ? person.email.slice(0, -14)
                          : person.email}
                      </td>
                      <td>{person.role === "admin" ? "Admin" : "Counter"}</td>
                      <td>
                        <span className={`pill ${person.active ? "good" : ""}`}>
                          {person.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {person.role !== "admin" && (
                          <button
                            className="text-button"
                            onClick={() => toggleStaff(person)}
                          >
                            {person.active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!staff.length && (
                <div className="table-empty">No staff accounts yet.</div>
              )}
            </div>
          </section>
        )}
        {view === "settings" && (
          <section className="page-content settings-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">MAKE IT YOURS</div>
                <h1>
                  Store settings<span className="heading-dot">.</span>
                </h1>
                <p>The details that make this your store.</p>
              </div>
            </div>
            <form onSubmit={saveSettings}>
              <div className="settings-section">
                <div>
                  <h2>Store details</h2>
                  <p>These details appear on your receipts.</p>
                </div>
                <div className="settings-fields">
                  <label>
                    Store name
                    <input
                      required
                      maxLength={100}
                      value={settingsDraft.shop_name}
                      onChange={(event) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          shop_name: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Address
                    <input
                      maxLength={200}
                      value={settingsDraft.address || ""}
                      onChange={(event) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          address: event.target.value,
                        })
                      }
                      placeholder="Store address"
                    />
                  </label>
                  <div className="field-row">
                    <label>
                      Phone
                      <input
                        maxLength={30}
                        value={settingsDraft.phone || ""}
                        onChange={(event) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            phone: event.target.value,
                          })
                        }
                        placeholder="Phone number"
                      />
                    </label>
                    <label>
                      GSTIN
                      <input
                        maxLength={20}
                        value={settingsDraft.gstin || ""}
                        onChange={(event) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            gstin: event.target.value,
                          })
                        }
                        placeholder="GSTIN, if applicable"
                      />
                    </label>
                  </div>
                </div>
              </div>
              <div className="settings-section">
                <div>
                  <h2>GST settings</h2>
                  <p>Only an admin can change this setting.</p>
                </div>
                <div className="settings-fields">
                  <div className="toggle-row">
                    <div>
                      <strong>Apply GST to sales</strong>
                      <p>
                        {settingsDraft.gst_enabled
                          ? "GST applies to eligible items; cigarettes are excluded."
                          : "GST is currently off."}
                      </p>
                    </div>
                    <label className="switch">
                      <input
                        aria-label="Apply GST to sales"
                        type="checkbox"
                        checked={settingsDraft.gst_enabled}
                        onChange={(event) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            gst_enabled: event.target.checked,
                          })
                        }
                      />
                      <span />
                    </label>
                  </div>
                  <label>
                    GST rate (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      value={settingsDraft.gst_rate}
                      onChange={(event) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          gst_rate: event.target.value,
                        })
                      }
                      disabled={!settingsDraft.gst_enabled}
                    />
                  </label>
                  <p className="hint">
                    A single rate applies to all products. Configure according
                    to your applicable tax requirements.
                  </p>
                </div>
              </div>
              <div className="settings-actions">
                <button className="button primary" disabled={busy}>
                  Save settings <Check size={16} />
                </button>
              </div>
            </form>
          </section>
        )}
      </main>
      {categoryForm && (
        <div className="modal-backdrop" onClick={() => setCategoryForm(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">FOOD INVENTORY</p>
                <h2>Add a food category</h2>
              </div>
              <button
                className="icon-button"
                title="Close"
                onClick={() => setCategoryForm(false)}
              >
                <X size={19} />
              </button>
            </div>
            <form className="form-stack" onSubmit={saveCategory}>
              <label>
                Category name
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={categoryName}
                  onChange={(event) => {
                    setCategoryName(event.target.value);
                    setCategoryError("");
                  }}
                  placeholder="e.g. Snacks"
                />
              </label>
              {categoryError && <p className="notice">{categoryError}</p>}
              <button className="button primary" disabled={busy}>
                Create category <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
      {productForm && (
        <div className="modal-backdrop" onClick={() => setProductForm(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">YOUR INVENTORY</p>
                <h2>{productForm.id ? "Edit product" : "Add a product"}</h2>
              </div>
              <button
                className="icon-button"
                title="Close"
                onClick={() => setProductForm(null)}
              >
                <X size={19} />
              </button>
            </div>
            <form className="form-stack" onSubmit={saveProduct}>
              <label>
                Product name
                <input
                  required
                  maxLength={100}
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm({ ...productForm, name: event.target.value })
                  }
                />
              </label>
              <div className="field-row">
                <label>
                  SKU
                  <input
                    maxLength={50}
                    value={productForm.sku || ""}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        sku: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Product type
                  <select
                    value={sectionForProduct(productForm)}
                    onChange={(event) => {
                      const nextSection = event.target.value;
                      setProductForm({
                        ...productForm,
                        category:
                          nextSection === "Cigarettes"
                            ? "Cigarettes"
                            : sectionForProduct(productForm) === "Cigarettes"
                              ? ""
                              : productForm.category,
                      });
                    }}
                  >
                    <option value="Cigarettes">Cigarettes</option>
                    <option value="Other food items">Food item</option>
                  </select>
                </label>
              </div>
              {sectionForProduct(productForm) === "Cigarettes" ? (
                <label>
                  Brand
                  <input
                    required
                    maxLength={100}
                    placeholder="e.g. brand name"
                    value={productForm.brand || ""}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        brand: event.target.value,
                      })
                    }
                  />
                </label>
              ) : (
                <div className="field-row">
                  <label>
                    Food category
                    <select
                      required
                      value={productForm.category || ""}
                      onChange={(event) =>
                        setProductForm({
                          ...productForm,
                          category: event.target.value,
                        })
                      }
                    >
                      <option value="" disabled>
                        Select a category
                      </option>
                      {foodCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Subcategory
                    <input
                      maxLength={100}
                      placeholder="e.g. Chips"
                      value={productForm.subcategory || ""}
                      onChange={(event) =>
                        setProductForm({
                          ...productForm,
                          subcategory: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              )}
              <div className="field-row">
                <label>
                  Selling price (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={productForm.price}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        price: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Manufacturing cost (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={productForm.cost_price ?? ""}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        cost_price: event.target.value,
                      })
                    }
                    aria-describedby="manufacturing-cost-help"
                  />
                </label>
              </div>
              <p className="hint" id="manufacturing-cost-help">
                Private to admins. Staff only see the selling price.
              </p>
              <label>
                Stock
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={productForm.stock}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      stock: event.target.value,
                    })
                  }
                />
              </label>
              {productForm.id && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={productForm.active}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        active: event.target.checked,
                      })
                    }
                  />{" "}
                  Available for sale
                </label>
              )}
              <button className="button primary" disabled={busy}>
                Save product <Check size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
      {staffForm && (
        <div className="modal-backdrop" onClick={() => setStaffForm(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">STAFF ACCESS</p>
                <h2>Add a team member</h2>
              </div>
              <button
                className="icon-button"
                title="Close"
                onClick={() => setStaffForm(null)}
              >
                <X size={19} />
              </button>
            </div>
            <form className="form-stack" onSubmit={saveStaff}>
              <label>
                Name
                <input
                  maxLength={100}
                  aria-invalid={Boolean(staffTouched.name && staffFieldError("name", staffForm.name))}
                  value={staffForm.name}
                  onBlur={() => setStaffTouched({ ...staffTouched, name: true })}
                  onChange={(event) => {
                    setStaffForm({ ...staffForm, name: event.target.value });
                    setStaffTouched({ ...staffTouched, name: true });
                    setStaffFormError("");
                  }}
                />
                {staffTouched.name && staffFieldError("name", staffForm.name) && (
                  <span className="field-error">{staffFieldError("name", staffForm.name)}</span>
                )}
              </label>
              <label>
                Username
                <input
                  maxLength={50}
                  aria-invalid={Boolean(staffTouched.username && staffFieldError("username", staffForm.username))}
                  value={staffForm.username}
                  onBlur={() => setStaffTouched({ ...staffTouched, username: true })}
                  onChange={(event) => {
                    setStaffForm({ ...staffForm, username: event.target.value });
                    setStaffTouched({ ...staffTouched, username: true });
                    setStaffFormError("");
                  }}
                  placeholder="e.g. staff"
                />
                {staffTouched.username && staffFieldError("username", staffForm.username) && (
                  <span className="field-error">{staffFieldError("username", staffForm.username)}</span>
                )}
              </label>
              <label>
                Temporary password
                <input
                  type="password"
                  aria-invalid={Boolean(staffTouched.password && staffFieldError("password", staffForm.password))}
                  value={staffForm.password}
                  onBlur={() => setStaffTouched({ ...staffTouched, password: true })}
                  onChange={(event) => {
                    setStaffForm({ ...staffForm, password: event.target.value });
                    setStaffTouched({ ...staffTouched, password: true });
                    setStaffFormError("");
                  }}
                />
                {staffTouched.password && staffFieldError("password", staffForm.password) && (
                  <span className="field-error">{staffFieldError("password", staffForm.password)}</span>
                )}
              </label>
              {staffFormError && <p className="notice">{staffFormError}</p>}
              <p className="hint">
                This account can create and manage its own orders.
              </p>
              <button className="button primary" disabled={busy}>
                Create account <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
      {editSale && (
        <div className="modal-backdrop" onClick={() => setEditSale(null)}>
          <div
            className="modal order-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-edit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">ORDER {editSale.order_code}</p>
                <h2 id="order-edit-title">Edit order items</h2>
              </div>
              <button
                className="icon-button"
                title="Close"
                onClick={() => setEditSale(null)}
              >
                <X size={19} />
              </button>
            </div>
            <form className="form-stack" onSubmit={saveEditedOrder}>
              <div className="order-edit-lines">
                {editItems.map((item, index) => {
                  const originalItem = editSale.items.find(
                    (original) => original.product_id === item.product_id,
                  );
                  const selectedProduct = products.find(
                    (product) => product.id === item.product_id,
                  );
                  const maxQuantity = selectedProduct?.active
                    ? Math.min(
                        100000,
                        Number(selectedProduct.stock) +
                          Number(originalItem?.quantity || 0),
                      )
                    : Number(originalItem?.quantity || 1);
                  return (
                    <div className="order-edit-line" key={`${index}-${item.product_id}`}>
                      <label>
                        Product
                        <select
                          required
                          value={item.product_id}
                          onChange={(event) =>
                            changeEditedProduct(index, event.target.value)
                          }
                        >
                          <option value="">Select a product</option>
                          {activeProducts.map((product) => (
                            <option
                              key={product.id}
                              value={product.id}
                              disabled={
                                editItems.some(
                                  (other, otherIndex) =>
                                    otherIndex !== index &&
                                    other.product_id === product.id,
                                ) ||
                                (Number(product.stock) <= 0 &&
                                  product.id !== item.product_id)
                              }
                            >
                              {product.name} · {money(product.price)} · stock{" "}
                              {product.stock}
                            </option>
                          ))}
                          {item.product_id &&
                            !activeProducts.some(
                              (product) => product.id === item.product_id,
                            ) && (
                              <option value={item.product_id}>
                                {item.name} · inactive
                              </option>
                            )}
                        </select>
                      </label>
                      <label>
                        Qty
                        <input
                          type="number"
                          min="1"
                          max={maxQuantity}
                          step="1"
                          required
                          value={item.quantity}
                          onChange={(event) =>
                            setEditItems((current) =>
                              current.map((line, lineIndex) =>
                                lineIndex === index
                                  ? {
                                      ...line,
                                      quantity:
                                        event.target.value === ""
                                          ? ""
                                          : Number(event.target.value),
                                    }
                                  : line,
                              ),
                            )
                          }
                        />
                      </label>
                      <strong className="order-edit-line-total">
                        {money(Number(item.price || 0) * Number(item.quantity || 0))}
                      </strong>
                      <button
                        className="icon-button order-edit-remove"
                        type="button"
                        title="Remove item"
                        aria-label={`Remove ${item.name || "item"} from order`}
                        onClick={() =>
                          setEditItems((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                className="button secondary order-add-item"
                type="button"
                onClick={() =>
                  setEditItems((current) => [
                    ...current,
                    { product_id: "", name: "", price: 0, quantity: 1 },
                  ])
                }
              >
                <Plus size={15} /> Add item
              </button>
              <div className="order-edit-total">
                <span>Updated total</span>
                <strong>{money(editedSubtotal + editedGst)}</strong>
              </div>
              <p className="hint">
                Existing item prices stay unchanged; new items use today’s product price.
                If payment is confirmed, settle any total difference with the customer.
              </p>
              {notice && <p className="notice">{notice}</p>}
              <div className="order-confirm-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setEditSale(null)}
                >
                  Go back
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    !editItems.length ||
                    editItems.some(
                      (item) =>
                        !item.product_id ||
                        !Number.isInteger(item.quantity) ||
                        item.quantity < 1 ||
                        item.quantity > 100000,
                    ) ||
                    new Set(editItems.map((item) => item.product_id)).size !==
                      editItems.length
                  }
                >
                  {busy ? "Saving changes..." : "Save order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {cancelSaleTarget && (
        <div
          className="modal-backdrop"
          onClick={() => setCancelSaleTarget(null)}
        >
          <div
            className="modal order-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-order-cancel-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">CANCEL ORDER</p>
                <h2 id="saved-order-cancel-title">
                  Cancel order {cancelSaleTarget.order_code}?
                </h2>
              </div>
              <button
                className="icon-button"
                title="Close"
                onClick={() => setCancelSaleTarget(null)}
              >
                <X size={19} />
              </button>
            </div>
            <p className="order-confirm-warning">
              This order will be cancelled and all its items returned to stock.
              {cancelSaleTarget.status === "preparing" &&
                " Payment was already confirmed; please refund the customer manually."}
            </p>
            <div className="order-confirm-actions">
              <button
                className="button secondary"
                onClick={() => setCancelSaleTarget(null)}
              >
                Keep order
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={cancelSavedOrder}
              >
                {busy ? "Cancelling..." : "Cancel order"}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmAction && (
        <div className="modal-backdrop" onClick={() => setConfirmAction(null)}>
          <div
            className="modal order-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">
                  {confirmAction === "place" ? "CHECKOUT CONFIRMATION" : "UNFINISHED ORDER"}
                </p>
                <h2 id="order-confirm-title">
                  {confirmAction === "place"
                    ? "Place this order?"
                    : confirmAction === "cancel-and-new"
                      ? "Discard and start a new order?"
                      : "Cancel this order?"}
                </h2>
              </div>
              <button
                className="icon-button"
                title="Close"
                onClick={() => setConfirmAction(null)}
              >
                <X size={19} />
              </button>
            </div>
            {confirmAction === "place" ? (
              <>
                <div className="order-confirm-summary">
                  <div className="order-confirm-meta">
                    <span>{customer.trim() || "Walk-in customer"} · {customerPhone}</span>
                    <span>{itemCount} {itemCount === 1 ? "item" : "items"} · {payment}</span>
                  </div>
                  {cart.map((item) => (
                    <div className="order-confirm-item" key={item.id}>
                      <span>{item.name} × {item.quantity}</span>
                      <strong>{money(item.price * item.quantity)}</strong>
                    </div>
                  ))}
                  <div className="order-confirm-total">
                    <span>Total to collect</span>
                    <strong>{money(total)}</strong>
                  </div>
                </div>
                <p className="hint">Please check the items and total before confirming this sale.</p>
              </>
            ) : (
              <p className="order-confirm-warning">
                {confirmAction === "cancel-and-new"
                  ? `The current order with ${itemCount} ${itemCount === 1 ? "item" : "items"} will be discarded before a new one starts.`
                  : `This draft order with ${itemCount} ${itemCount === 1 ? "item" : "items"} will be discarded.`}
              </p>
            )}
            <div className="order-confirm-actions">
              <button className="button secondary" onClick={() => setConfirmAction(null)}>
                Go back
              </button>
              <button
                className={`button ${confirmAction === "place" ? "primary" : "danger"}`}
                onClick={confirmOrderAction}
                disabled={confirmAction === "place" && (!cart.length || busy)}
                autoFocus
              >
                {confirmAction === "place"
                  ? busy ? "Placing order..." : "Confirm and place order"
                  : confirmAction === "cancel-and-new" ? "Discard and start new" : "Discard order"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showShortcuts && (
        <div className="modal-backdrop" onClick={() => setShowShortcuts(false)}>
          <div
            className="modal shortcuts-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">FASTER CHECKOUT</p>
                <h2 id="shortcuts-title">Keyboard shortcuts</h2>
              </div>
              <button
                className="icon-button"
                title="Close"
                onClick={() => setShowShortcuts(false)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="shortcut-list">
              <div><span>Start a new order</span><kbd>Alt</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>N</kbd></div>
              <div><span>Focus product search</span><kbd>/</kbd></div>
              <div><span>Move through products</span><kbd>↑</kbd><b>/</b><kbd>↓</kbd></div>
              <div><span>Add focused product</span><kbd>Enter</kbd></div>
              <div><span>Review and confirm sale</span><kbd>Ctrl</kbd><b>+</b><kbd>Enter</kbd></div>
              <div><span>Ask before discarding draft</span><kbd>Esc</kbd></div>
            </div>
            <p className="hint">Placing a sale always asks you to review the customer, items and total first.</p>
            <button className="button primary" onClick={() => setShowShortcuts(false)}>Got it</button>
          </div>
        </div>
      )}
      {receipt && (
        <div className="modal-backdrop" onClick={() => setReceipt(null)}>
          <div
            className="modal receipt-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head no-print">
              <div>
                <p className="eyebrow">{orderLabels[receipt.status]}</p>
                <h2>Order receipt</h2>
              </div>
              <button
                className="icon-button"
                title="Close"
                onClick={() => setReceipt(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="receipt-print">
              <div className="receipt-title">
                <div className="receipt-brand-mark" aria-hidden="true">
                  <ReceiptText size={22} strokeWidth={1.7} />
                </div>
                <p className="receipt-store-name">{receipt.shop_name || "The Counter"}</p>
                <h2>RECEIPT</h2>
                <p className="receipt-caption">PAYMENT RECEIPT</p>
                {receipt.shop_address && <p>{receipt.shop_address}</p>}
                {receipt.shop_phone && <p>Phone: {receipt.shop_phone}</p>}
                {receipt.shop_gstin && <p>GSTIN: {receipt.shop_gstin}</p>}
              </div>
              <div className="receipt-meta">
                <div>
                  <span>ORDER</span>
                  <strong>{receipt.order_code || receipt.id}</strong>
                </div>
                <div>
                  <span>DATE</span>
                  <strong>{date(receipt.created_at)}</strong>
                </div>
              </div>
              <div className="receipt-customer-details">
                <p>{receipt.customer || "Walk-in customer"}</p>
                <span>Customer ID: {receipt.customer_code || "—"}</span>
                {receipt.customer_phone && <span>Mobile: {receipt.customer_phone}</span>}
                <span>Payment method: {receipt.payment_method}</span>
                <span className={`receipt-status receipt-status-${receipt.status}`}>
                  Order status: {receiptStatusLabels[receipt.status] || receipt.status}
                </span>
              </div>
              <div className="receipt-products">
                {receipt.items?.map((item, index) => (
                  <div className="receipt-product" key={index}>
                    <div className="receipt-product-line">
                      <strong>{item.name}</strong>
                      <b>{money(Number(item.price) * item.quantity)}</b>
                    </div>
                    <small>{item.quantity} × {money(item.price)} each</small>
                  </div>
                ))}
              </div>
              <div className="receipt-summary">
                <div>
                  <span>Subtotal</span>
                  <span>{money(receipt.subtotal)}</span>
                </div>
                <div>
                  <span>GST ({receipt.gst_rate}%, cigarettes excluded)</span>
                  <span>{money(receipt.gst_amount)}</span>
                </div>
                <div className="receipt-total">
                  <strong>Total</strong>
                  <strong>{money(receipt.total)}</strong>
                </div>
              </div>
              <p className="receipt-thanks">THANK YOU FOR SHOPPING WITH US!</p>
            </div>
            <div className="receipt-actions no-print">
              <button
                className="button whatsapp-button"
                onClick={() => shareReceiptOnWhatsApp(receipt)}
                disabled={sharingReceipt}
              >
                <MessageCircle size={16} />
                {sharingReceipt ? "Preparing bill..." : "Send bill on WhatsApp"}
              </button>
              <button
                className="button secondary"
                onClick={() => window.print()}
              >
                <Printer size={16} /> Print receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
