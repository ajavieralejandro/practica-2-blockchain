import { addresses, abis } from './index';

export const DEFAULT_CONTRACT_ADDRESS = addresses.delayedPayment;

export const DELAYED_PAYMENT_JSON_ABI = abis.delayedPayment;

export const DELAYED_PAYMENT_ABI = [
  // Core Escrow & Milestone Methods (Component 1 Plan)
  "function createPayment(uint256 _dueTime, uint256 _amount, address _beneficiary, string calldata _agreementCID) external returns (uint256 id)",
  "function pay(uint256 _paymentId) external payable",
  "function submitDeliverable(uint256 _paymentId, string calldata _deliverableCID) external",
  "function splitAndApproveMilestone(uint256 _paymentId, uint256 _amount, string calldata _deliverableCID) external returns (uint256 milestonePaymentId)",
  "function claim(uint256 _paymentId) external",
  "function slashPayer(uint256 _paymentId) external",
  "function payWithPayment(uint256 _withId, uint256 _paymentId) external",

  // State Getters & ERC721 Metadata (Exact struct order from Plan Component 1)
  "function payments(uint256 _paymentId) external view returns (address beneficiary, uint256 amount, uint256 payed, uint48 dueTime, string memory agreementCID, string memory deliverableCID, bool approved)",
  "function slashed(address _debtor) external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string memory)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function name() external view returns (string memory)",
  "function symbol() external view returns (string memory)",

  // Events (Exact signatures from Practice 1 + Practice 2 Plan Component 1)
  "event NewPayment(address _beneficiary, address _debtor, uint256 _id)",
  "event DeliverableSubmitted(uint256 indexed paymentId, string deliverableCID)",
  "event MilestoneApproved(uint256 indexed originalPaymentId, uint256 indexed milestonePaymentId, uint256 amount, string deliverableCID)",
  "event SplitPayment(uint256 _paymentId, uint256 _splittedId, address _debtor)",
  "event SlashedPayer(address _payer, uint256 _id)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];
