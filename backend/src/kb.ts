// Knowledge base used by the chatbot's fallback tier (and given to the AI tier as grounding).
export const KB: { id: string; keywords: string[]; answer: string }[] = [
  {
    id: "methods",
    keywords: [
      "payment method",
      "payment option",
      "how can i pay",
      "how do i pay",
      "pay by",
      "which payment",
      "accept",
    ],
    answer:
      "You can pay by UPI, debit/credit card, or net banking. UPI is usually the fastest.",
  },
  {
    id: "upi",
    keywords: ["upi", "vpa", "gpay", "phonepe", "paytm"],
    answer:
      "For UPI enter your UPI ID (like name@bank). Approve the request in your UPI app and this screen updates by itself.",
  },
  {
    id: "card",
    keywords: ["card", "cvv", "debit", "credit", "expiry"],
    answer:
      "For cards enter the card number, expiry (MM/YY), CVV and name. Card details are checked for format only and are never saved by this counter.",
  },
  {
    id: "netbanking",
    keywords: ["net banking", "netbanking", "internet banking", "bank login"],
    answer:
      "For net banking pick your bank and confirm on the bank page. Come back here; the status updates automatically.",
  },
  {
    id: "hold",
    keywords: [
      "how long",
      "hold",
      "timer",
      "countdown",
      "time left",
      "minutes",
    ],
    answer:
      "Your items are held for 2 minutes after you place the order. The countdown shows the time left. Nobody else can buy those units meanwhile.",
  },
  {
    id: "expired",
    keywords: ["expire", "expired", "time ran out", "too late"],
    answer:
      "When the hold ends without payment, the items go back on sale and the order shows as expired. You can place a new order.",
  },
  {
    id: "deducted",
    keywords: [
      "money deducted",
      "deducted",
      "debited",
      "charged",
      "amount cut",
      "money gone",
    ],
    answer:
      "If money was deducted but the order is not paid, keep your order number. Late or mismatched payments are checked by staff and refunded if the items are gone.",
  },
  {
    id: "failed",
    keywords: [
      "failed",
      "declined",
      "not working",
      "payment error",
      "did not go through",
    ],
    answer:
      "If a payment fails your hold stays active. Try another method before the countdown ends.",
  },
  {
    id: "refund",
    keywords: ["refund", "money back", "cancel"],
    answer:
      "Refunds for orders under review are issued by staff to the original payment method. Keep your order number handy.",
  },
  {
    id: "pickup",
    keywords: ["pickup", "pick up", "collect", "locker", "where do i get"],
    answer:
      "After payment succeeds, go to the locker and it opens for your order. An order can be collected only once.",
  },
  {
    id: "allergy",
    keywords: ["allergy", "allergen", "nuts", "gluten", "vegan", "vegetarian"],
    answer:
      "Check the product details: peanut and cashew items are marked. For allergy advice please ask staff, as this assistant cannot guarantee ingredients.",
  },
  {
    id: "hello",
    keywords: ["hello", "hi ", "hey", "help"],
    answer:
      'Hi! I can suggest snacks, explain payment options, or check your order. Try "something spicy under ₹60".',
  },
  {
    id: "thanks",
    keywords: ["thank", "thanks"],
    answer: "You are welcome! Enjoy your snacks.",
  },
];
