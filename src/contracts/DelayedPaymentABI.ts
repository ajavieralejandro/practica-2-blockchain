import { addresses, abis } from './index';

export const DEFAULT_CONTRACT_ADDRESS = addresses.delayedPayment;

export const DELAYED_PAYMENT_JSON_ABI = abis.delayedPayment;

export const DELAYED_PAYMENT_ABI = [
  // Core Escrow, Milestone & Dispute Methods (BC-Practica2/src/DelayedPayment.sol)
  "function createPayment(uint256 _dueTime, uint256 _amount, address _beneficiary, string calldata _agreementCID) external returns (uint256 id)",
  "function pay(uint256 _paymentId) external payable",
  "function submitDeliverable(uint256 _paymentId, string calldata _deliverableCID) external",
  "function splitAndApproveMilestone(uint256 _paymentId) external payable",
  "function disputePayment(uint256 _paymentId) external",
  "function undisputePayment(uint256 _paymentId) external",
  "function claim(uint256 _paymentId) external",
  "function slashPayer(uint256 _paymentId) external",
  "function payWithPayment(uint256 _withId, uint256 _paymentId) external",

  // State Getters & ERC721 Metadata (8-field struct from BC-Practica2/src/DelayedPayment.sol)
  "function payments(uint256 _paymentId) external view returns (address beneficiary, uint256 amount, uint256 payed, uint48 dueTime, string memory agreementCID, string memory deliverableCID, bool approved, bool disputed)",
  "function slashed(address _debtor) external view returns (uint256 slashedPayments)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 _paymentID) external view returns (string memory)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function name() external view returns (string memory)",
  "function symbol() external view returns (string memory)",

  // Events (Exact indexed signatures from BC-Practica2/src/DelayedPayment.sol)
  "event NewPayment(address _beneficiary, address _debtor, uint256 indexed _id)",
  "event SlashedPayer(address _payer, uint256 indexed _id)",
  "event SplitPayment(uint256 indexed _paymentId, uint256 indexed _splittedId, address _debtor)",
  "event DeliverableSubmitted(uint256 indexed _paymentId, string deliverableCID)",
  "event MilestoneApproved(uint256 indexed originalPaymentId, uint256 indexed milestonePaymentId, uint256 amount, string deliverableCID)",
  "event DisputedPayment(uint256 indexed paymentId, address beneficiary)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];
