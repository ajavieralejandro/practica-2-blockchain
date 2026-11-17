import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { DELAYED_PAYMENT_ABI, DEFAULT_CONTRACT_ADDRESS } from '../contracts/DelayedPaymentABI';
import { PaymentRecord, UserRole } from '../types/payment';
import { orbitService } from '../services/orbitService';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const STORAGE_PAYMENTS_KEY = 'delayed_payment_cached_records_v3';
const STORAGE_CONTRACT_ADDR_KEY = 'delayed_payment_contract_address';

function formatShortId(id: string): string {
  if (!id) return '#0';
  if (id.length <= 8) return `#${id}`;
  return `#${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function useDelayedPayment() {
  const [account, setAccount] = useState<string>('');
  const [chainId, setChainId] = useState<number | null>(null);
  const [networkName, setNetworkName] = useState<string>('No conectada');
  const [role, setRole] = useState<UserRole>('client');
  const [contractAddress, setContractAddressState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_CONTRACT_ADDR_KEY) || DEFAULT_CONTRACT_ADDRESS;
  });
  const [isContractDeployed, setIsContractDeployed] = useState<boolean>(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [txPending, setTxPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const setContractAddress = (addr: string) => {
    const trimmed = addr.trim();
    setContractAddressState(trimmed);
    localStorage.setItem(STORAGE_CONTRACT_ADDR_KEY, trimmed);
  };

  const loadFallbackPayments = useCallback((currentAccount: string): PaymentRecord[] => {
    const raw = localStorage.getItem(STORAGE_PAYMENTS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        // continuar a seed
      }
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const activeAddr = currentAccount || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const providerAddr = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    const seed: PaymentRecord[] = [
      {
        id: '1001',
        shortId: '#1001',
        debtor: activeAddr,
        beneficiary: providerAddr,
        amountWei: ethers.utils.parseEther('1.0').toString(),
        amountEth: '1.0',
        payedWei: '0',
        payedEth: '0.0',
        dueTime: nowSec + 86400 * 7,
        approved: false,
        disputed: false,
        claimed: false,
        agreementCID: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        deliverableCID: 'bafybeif255okcs4772x4nffomz6iypa5ptps7zfcg6r4xovuhuxgq2m2ey',
        tokenURI: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      },
      {
        id: '1002',
        shortId: '#1002',
        debtor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        beneficiary: activeAddr,
        amountWei: ethers.utils.parseEther('0.4').toString(),
        amountEth: '0.4',
        payedWei: ethers.utils.parseEther('0.4').toString(),
        payedEth: '0.4',
        dueTime: nowSec + 86400 * 3,
        approved: true,
        disputed: false,
        claimed: false,
        agreementCID: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        deliverableCID: 'bafybeif255okcs4772x4nffomz6iypa5ptps7zfcg6r4xovuhuxgq2m2ey',
        tokenURI: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        parentPaymentId: '1001',
      },
    ];
    localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(seed));
    return seed;
  }, []);

  const saveLocalPayments = (list: PaymentRecord[]) => {
    setPayments(list);
    localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(list));
  };

  /**
   * Lee todos los pagos desde el Smart Contract DelayPayment (BC-Practica2/src/DelayedPayment.sol)
   * usando ethers.js v5.7.0
   */
  const fetchPaymentsFromChain = useCallback(
    async (userAddr?: string) => {
      const targetUser = userAddr ?? account;
      if (!window.ethereum || !ethers.utils.isAddress(contractAddress)) {
        setIsContractDeployed(false);
        setPayments(loadFallbackPayments(targetUser));
        return;
      }

      setLoading(true);
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const code = await provider.getCode(contractAddress);

        if (!code || code === '0x') {
          setIsContractDeployed(false);
          setPayments(loadFallbackPayments(targetUser));
          setLoading(false);
          return;
        }

        setIsContractDeployed(true);
        const contract = new ethers.Contract(contractAddress, DELAYED_PAYMENT_ABI, provider);

        const idMap = new Map<string, ethers.BigNumber>();
        const debtorByEvent = new Map<string, string>();
        const parentByChild = new Map<string, string>();

        try {
          const newPaymentLogs = await contract.queryFilter(
            contract.filters.NewPayment(),
            0,
            'latest'
          );
          for (const log of newPaymentLogs) {
            const idBn: ethers.BigNumber | undefined = log.args?._id;
            const debtorAddr: string | undefined = log.args?._debtor;
            if (idBn) {
              idMap.set(idBn.toString(), idBn);
              if (debtorAddr) debtorByEvent.set(idBn.toString(), debtorAddr);
            }
          }
        } catch (e) {
          console.warn('Aviso filtrando NewPayment:', e);
        }

        try {
          const milestoneLogs = await contract.queryFilter(
            contract.filters.MilestoneApproved(),
            0,
            'latest'
          );
          for (const log of milestoneLogs) {
            const origBn: ethers.BigNumber | undefined = log.args?.originalPaymentId;
            const mIdBn: ethers.BigNumber | undefined = log.args?.milestonePaymentId;
            if (mIdBn) {
              idMap.set(mIdBn.toString(), mIdBn);
              if (origBn) parentByChild.set(mIdBn.toString(), origBn.toString());
            }
          }
        } catch {
          // continuar
        }

        const fetched: PaymentRecord[] = [];
        for (const [idStr, rawId] of idMap.entries()) {
          try {
            const p = await contract.payments(rawId);
            let owner = debtorByEvent.get(idStr) || ethers.constants.AddressZero;
            let tokenUri = '';
            let isBurned = false;

            try {
              owner = await contract.ownerOf(rawId);
              tokenUri = await contract.tokenURI(rawId);
            } catch {
              isBurned = true;
            }

            const amountWei = p.amount.toString();
            const payedWei = p.payed.toString();
            const agreementCID = p.agreementCID || '';
            const deliverableCID = p.deliverableCID || '';

            fetched.push({
              id: idStr,
              shortId: formatShortId(idStr),
              beneficiary: p.beneficiary,
              debtor: owner,
              amountWei,
              amountEth: ethers.utils.formatEther(p.amount),
              payedWei,
              payedEth: ethers.utils.formatEther(p.payed),
              dueTime: Number(p.dueTime),
              approved: Boolean(p.approved),
              disputed: Boolean(p.disputed),
              claimed: isBurned,
              agreementCID,
              deliverableCID,
              tokenURI: tokenUri || `ipfs://${agreementCID}`,
              parentPaymentId: parentByChild.get(idStr),
            });
          } catch (itemErr) {
            console.warn('Error leyendo pago individual:', idStr, itemErr);
          }
        }

        setPayments(fetched.reverse());
      } catch (err: any) {
        console.warn('Usando estado local sincronizado:', err);
        setPayments(loadFallbackPayments(targetUser));
      } finally {
        setLoading(false);
      }
    },
    [account, contractAddress, loadFallbackPayments]
  );

  const connectWallet = useCallback(async () => {
    setError(null);
    if (!window.ethereum) {
      setError('MetaMask no detectado. Instala la extensión MetaMask en tu navegador.');
      setPayments(loadFallbackPayments(''));
      return;
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts: string[] = await provider.send('eth_requestAccounts', []);
      const network = await provider.getNetwork();

      if (accounts.length > 0) {
        const currentAddr = ethers.utils.getAddress(accounts[0]);
        setAccount(currentAddr);
        setChainId(network.chainId);
        setNetworkName(
          network.chainId === 11155111
            ? 'Sepolia Testnet'
            : network.chainId === 31337 || network.chainId === 1337
            ? 'Localhost / Anvil'
            : network.name
        );

        await fetchPaymentsFromChain(currentAddr);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con MetaMask.');
      setPayments(loadFallbackPayments(''));
    }
  }, [fetchPaymentsFromChain, loadFallbackPayments]);

  useEffect(() => {
    if (window.ethereum) {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      provider
        .listAccounts()
        .then(async (accounts) => {
          if (accounts.length > 0) {
            const currentAddr = ethers.utils.getAddress(accounts[0]);
            const net = await provider.getNetwork();
            setAccount(currentAddr);
            setChainId(net.chainId);
            setNetworkName(
              net.chainId === 11155111
                ? 'Sepolia Testnet'
                : net.chainId === 31337 || net.chainId === 1337
                ? 'Localhost / Anvil'
                : net.name
            );
            await fetchPaymentsFromChain(currentAddr);
          } else {
            setPayments(loadFallbackPayments(''));
          }
        })
        .catch(() => {
          setPayments(loadFallbackPayments(''));
        });

      const handleAccountsChanged = (accs: string[]) => {
        if (accs.length > 0) {
          const checksummed = ethers.utils.getAddress(accs[0]);
          setAccount(checksummed);
          fetchPaymentsFromChain(checksummed);
        } else {
          setAccount('');
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    } else {
      setPayments(loadFallbackPayments(''));
    }
  }, [fetchPaymentsFromChain, loadFallbackPayments]);

  useEffect(() => {
    if (!account || payments.length === 0) return;
    const lower = account.toLowerCase();
    const asBeneficiary = payments.filter((p) => p.beneficiary.toLowerCase() === lower).length;
    const asDebtor = payments.filter((p) => p.debtor.toLowerCase() === lower).length;
    if (asBeneficiary > asDebtor) {
      setRole('provider');
    } else if (asDebtor > 0) {
      setRole('client');
    }
  }, [account]);

  /**
   * 1. createPayment(uint256 _dueTime, uint256 _amount, address _beneficiary, string calldata _agreementCID)
   */
  const createPayment = async (params: {
    dueTime: number;
    amountEth: string;
    beneficiary: string;
    agreementCID: string;
    fundImmediately?: boolean;
  }) => {
    setError(null);
    const shouldFund = params.fundImmediately ?? false;
    setTxPending(
      shouldFund
        ? 'Acuñando pago ERC-721 (createPayment) y depositando fondos en Escrow (pay)...'
        : 'Acuñando pago diferido ERC-721 (createPayment)...'
    );

    try {
      const cleanBeneficiary = ethers.utils.getAddress(params.beneficiary.trim());
      const amountWei = ethers.utils.parseEther(params.amountEth);
      let createdId = String(Math.floor(1000 + Math.random() * 9000));

      if (window.ethereum && isContractDeployed) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(contractAddress, DELAYED_PAYMENT_ABI, signer);

        const tx = await contract.createPayment(
          params.dueTime,
          amountWei,
          cleanBeneficiary,
          params.agreementCID
        );
        setLastTxHash(tx.hash);
        const receipt = await tx.wait();

        const newPaymentEvt = receipt.events?.find((e: any) => e.event === 'NewPayment');
        if (newPaymentEvt?.args?._id) {
          createdId = newPaymentEvt.args._id.toString();
        }

        if (shouldFund && newPaymentEvt?.args?._id) {
          setTxPending(`Fondeando pago #${createdId.slice(0, 6)} mediante pay()...`);
          const payTx = await contract.pay(newPaymentEvt.args._id, { value: amountWei });
          setLastTxHash(payTx.hash);
          await payTx.wait();
        }

        await fetchPaymentsFromChain(account);
      } else {
        const sender = account || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        const newRecord: PaymentRecord = {
          id: createdId,
          shortId: `#${createdId}`,
          beneficiary: cleanBeneficiary,
          debtor: sender,
          amountWei: amountWei.toString(),
          amountEth: params.amountEth,
          payedWei: shouldFund ? amountWei.toString() : '0',
          payedEth: shouldFund ? params.amountEth : '0.0',
          dueTime: params.dueTime,
          approved: false,
          disputed: false,
          claimed: false,
          agreementCID: params.agreementCID,
          deliverableCID: '',
          tokenURI: `ipfs://${params.agreementCID}`,
        };
        saveLocalPayments([newRecord, ...payments]);
      }

      await orbitService.addEvent({
        paymentId: createdId,
        type: 'MILESTONE_STARTED',
        author: account || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        role: 'client',
        message: `Pago diferido creado (${params.amountEth} ETH) con acuerdo en IPFS (${
          shouldFund ? 'Fondeado vía pay()' : 'Listo para fondear por hitos en splitAndApproveMilestone'
        }).`,
        cidAttachment: params.agreementCID,
      });
    } catch (err: any) {
      setError(err?.reason || err?.message || 'Error al ejecutar createPayment');
      throw err;
    } finally {
      setTxPending(null);
    }
  };

  /**
   * 1b. pay(uint256 _paymentId) payable
   */
  const fundPayment = async (paymentId: string, amountEth: string) => {
    setError(null);
    setTxPending(`Depositando ${amountEth} ETH en el pago #${paymentId.slice(0, 6)} vía pay()...`);

    try {
      const addWei = ethers.utils.parseEther(amountEth);

      if (window.ethereum && isContractDeployed) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(contractAddress, DELAYED_PAYMENT_ABI, signer);

        const tx = await contract.pay(paymentId, { value: addWei });
        setLastTxHash(tx.hash);
        await tx.wait();
        await fetchPaymentsFromChain(account);
      } else {
        const updated = payments.map((p) => {
          if (p.id !== paymentId) return p;
          const nextPayed = ethers.BigNumber.from(p.payedWei).add(addWei);
          return {
            ...p,
            payedWei: nextPayed.toString(),
            payedEth: ethers.utils.formatEther(nextPayed),
          };
        });
        saveLocalPayments(updated);
      }

      await orbitService.addEvent({
        paymentId,
        type: 'PROGRESS_UPDATE',
        author: account || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        role: 'client',
        message: `Fondeo ejecutado en el contrato mediante pay(): +${amountEth} ETH.`,
      });
    } catch (err: any) {
      setError(err?.reason || err?.message || 'Error al ejecutar pay(paymentId)');
      throw err;
    } finally {
      setTxPending(null);
    }
  };

  /**
   * 2. submitDeliverable(uint256 _paymentId, string calldata _deliverableCID)
   */
  const submitDeliverable = async (paymentId: string, deliverableCID: string) => {
    setError(null);
    setTxPending(`Registrando entregable en Smart Contract para el pago #${paymentId.slice(0, 6)}...`);

    try {
      if (window.ethereum && isContractDeployed) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(contractAddress, DELAYED_PAYMENT_ABI, signer);

        const tx = await contract.submitDeliverable(paymentId, deliverableCID);
        setLastTxHash(tx.hash);
        await tx.wait();
        await fetchPaymentsFromChain(account);
      } else {
        const updated = payments.map((p) =>
          p.id === paymentId
            ? {
                ...p,
                deliverableCID,
              }
            : p
        );
        saveLocalPayments(updated);
      }

      await orbitService.addEvent({
        paymentId,
        type: 'DELIVERABLE_SUBMITTED',
        author: account || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        role: 'provider',
        message: `Entregable de hito anclado en IPFS y registrado en el contrato (submitDeliverable).`,
        cidAttachment: deliverableCID,
      });
    } catch (err: any) {
      setError(err?.reason || err?.message || 'Error al ejecutar submitDeliverable');
      throw err;
    } finally {
      setTxPending(null);
    }
  };

  /**
   * 3. splitAndApproveMilestone(uint256 _paymentId) external payable
   *    (En BC-Practica2/src/DelayedPayment.sol recibe 1 parámetro _paymentId y msg.value es el monto del hito)
   */
  const splitAndApproveMilestone = async (
    paymentId: string,
    splitAmountEth: string,
    deliverableCID: string
  ) => {
    setError(null);
    setTxPending(`Ejecutando splitAndApproveMilestone{value: ${splitAmountEth} ETH}(#${paymentId.slice(0, 6)})...`);

    try {
      const splitWei = ethers.utils.parseEther(splitAmountEth);

      if (window.ethereum && isContractDeployed) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(contractAddress, DELAYED_PAYMENT_ABI, signer);

        const tx = await contract.splitAndApproveMilestone(paymentId, { value: splitWei });
        setLastTxHash(tx.hash);
        await tx.wait();
        await fetchPaymentsFromChain(account);
      } else {
        const target = payments.find((p) => p.id === paymentId);
        if (!target) throw new Error('Pago no encontrado');

        const currentWei = ethers.BigNumber.from(target.amountWei);
        if (splitWei.gt(currentWei) || splitWei.lte(0)) {
          throw new Error('El monto a dividir excede el saldo del pago principal o es inválido.');
        }

        const remainingWei = currentWei.sub(splitWei);
        const remainingEth = ethers.utils.formatEther(remainingWei);
        const newSubId = `${paymentId}-${Math.floor(10 + Math.random() * 89)}`;

        const splittedToken: PaymentRecord = {
          id: newSubId,
          shortId: `#${newSubId}`,
          beneficiary: target.beneficiary,
          debtor: target.debtor,
          amountWei: splitWei.toString(),
          amountEth: splitAmountEth,
          payedWei: splitWei.toString(),
          payedEth: splitAmountEth,
          dueTime: target.dueTime,
          approved: true,
          disputed: false,
          claimed: false,
          agreementCID: target.agreementCID,
          deliverableCID: deliverableCID || target.deliverableCID,
          tokenURI: `ipfs://${target.agreementCID}`,
          parentPaymentId: target.id,
        };

        const updated = payments.map((p) =>
          p.id === paymentId
            ? {
                ...p,
                amountWei: remainingWei.toString(),
                amountEth: remainingEth,
                deliverableCID: '',
              }
            : p
        );
        saveLocalPayments([splittedToken, ...updated]);
      }

      await orbitService.addEvent({
        paymentId,
        type: 'PROGRESS_UPDATE',
        author: account || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        role: 'client',
        message: `Hito aprobado y fondeado por ${splitAmountEth} ETH mediante splitAndApproveMilestone{value}. Nuevo token hijo listo para claim.`,
        cidAttachment: deliverableCID,
      });
    } catch (err: any) {
      setError(err?.reason || err?.message || 'Error al ejecutar splitAndApproveMilestone');
      throw err;
    } finally {
      setTxPending(null);
    }
  };

  /**
   * 4. claim(uint256 _paymentId)
   */
  const claimPayment = async (paymentId: string) => {
    setError(null);
    setTxPending(`Reclamando fondos en Escrow para el token #${paymentId.slice(0, 6)} (claim)...`);

    try {
      if (window.ethereum && isContractDeployed) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(contractAddress, DELAYED_PAYMENT_ABI, signer);

        const tx = await contract.claim(paymentId);
        setLastTxHash(tx.hash);
        await tx.wait();
        await fetchPaymentsFromChain(account);
      } else {
        const updated = payments.map((p) => (p.id === paymentId ? { ...p, claimed: true } : p));
        saveLocalPayments(updated);
      }

      await orbitService.addEvent({
        paymentId,
        type: 'PROGRESS_UPDATE',
        author: account || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        role: 'provider',
        message: `Fondos reclamados exitosamente mediante claim(#${paymentId}). Token ERC-721 quemado.`,
      });
    } catch (err: any) {
      setError(err?.reason || err?.message || 'Error al ejecutar claim');
      throw err;
    } finally {
      setTxPending(null);
    }
  };

  /**
   * 5. disputePayment(uint256 _paymentId) & undisputePayment(uint256 _paymentId)
   */
  const toggleDisputePayment = async (paymentId: string, currentlyDisputed: boolean) => {
    setError(null);
    setTxPending(
      currentlyDisputed
        ? `Levantando disputa del pago #${paymentId.slice(0, 6)} (undisputePayment)...`
        : `Congelando pago en disputa #${paymentId.slice(0, 6)} (disputePayment)...`
    );

    try {
      if (window.ethereum && isContractDeployed) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(contractAddress, DELAYED_PAYMENT_ABI, signer);

        const tx = currentlyDisputed
          ? await contract.undisputePayment(paymentId)
          : await contract.disputePayment(paymentId);
        setLastTxHash(tx.hash);
        await tx.wait();
        await fetchPaymentsFromChain(account);
      } else {
        const updated = payments.map((p) =>
          p.id === paymentId ? { ...p, disputed: !currentlyDisputed } : p
        );
        saveLocalPayments(updated);
      }

      await orbitService.addEvent({
        paymentId,
        type: 'DISPUTE_NOTE',
        author: account || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        role: 'client',
        message: currentlyDisputed
          ? `Disputa resuelta por el cliente mediante undisputePayment(#${paymentId}).`
          : `Pago marcado en disputa mediante disputePayment(#${paymentId}). Reclamo bloqueado hasta resolución.`,
      });
    } catch (err: any) {
      setError(err?.reason || err?.message || 'Error al cambiar estado de disputa');
      throw err;
    } finally {
      setTxPending(null);
    }
  };

  /**
   * 6. slashPayer(uint256 _paymentId)
   */
  const slashPayer = async (paymentId: string) => {
    setError(null);
    setTxPending(`Ejecutando slashPayer(#${paymentId.slice(0, 6)}) por impago tras vencimiento...`);
    try {
      if (window.ethereum && isContractDeployed) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(contractAddress, DELAYED_PAYMENT_ABI, signer);
        const tx = await contract.slashPayer(paymentId);
        setLastTxHash(tx.hash);
        await tx.wait();
        await fetchPaymentsFromChain(account);
      }
      await orbitService.addEvent({
        paymentId,
        type: 'DISPUTE_NOTE',
        author: account || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        role: 'provider',
        message: `Deudor penalizado mediante slashPayer(#${paymentId}) por vencimiento con entregable presentado pero impago.`,
      });
    } catch (err: any) {
      setError(err?.reason || err?.message || 'Error al ejecutar slashPayer');
      throw err;
    } finally {
      setTxPending(null);
    }
  };

  return {
    account,
    chainId,
    networkName,
    role,
    setRole,
    contractAddress,
    setContractAddress,
    isContractDeployed,
    payments,
    loading,
    txPending,
    error,
    setError,
    lastTxHash,
    connectWallet,
    refreshPayments: () => fetchPaymentsFromChain(account),
    createPayment,
    fundPayment,
    submitDeliverable,
    splitAndApproveMilestone,
    claimPayment,
    toggleDisputePayment,
    slashPayer,
  };
}
