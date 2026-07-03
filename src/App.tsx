import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, 
  User, 
  MessageSquare, 
  Upload, 
  Search, 
  Download, 
  Image as ImageIcon, 
  Plus, 
  ListFilter,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  X,
  Tag,
  Ticket,
  Printer,
  QrCode,
  Share2,
  Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  updateDoc,
  deleteDoc,
  doc,
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  limit 
} from 'firebase/firestore';
import { db, auth } from './lib/firebase';
import { handleFirestoreError } from './lib/error-handler';
import { FollowUpData, OperationType, ProgressData, ProgressOutcome, ProgressChannel, VoucherData, VoucherType } from './types';
import imageCompression from 'browser-image-compression';
import axios from 'axios';
import Papa from 'papaparse';
import JsBarcode from 'jsbarcode';
import { Html5Qrcode } from 'html5-qrcode';
import html2canvas from 'html2canvas';

const getVoucherBenefitText = (voucher: any) => {
  if (!voucher) return '';
  const type = String(voucher.type).toLowerCase().trim();
  const val = String(voucher.value).trim();
  
  if (type === 'discount %' || type.includes('percent') || type.includes('diskon') || type.includes('%')) {
    const numeric = val.replace('%', '');
    return `Diskon ${numeric}%`;
  }
  if (type === 'nominal potongan' || type.includes('nominal') || type.includes('potongan') || type.includes('rupiah') || type.includes('idr')) {
    const numeric = parseInt(val.replace(/\D/g, ''), 10);
    return isNaN(numeric) ? `Potongan Rp ${val}` : `Potongan Rp ${numeric.toLocaleString('id-ID')}`;
  }
  return val;
};

// Design Constants
const CATEGORIES = ['CS Follow-up', 'Progress', 'Voucher', 'Admin Tracking'];

export default function App() {
  const [activeTab, setActiveTab] = useState(CATEGORIES[0]);
  const [activeProgressSubTab, setActiveProgressSubTab] = useState<'pending' | 'done'>('pending');
  const [progressFilterMonth, setProgressFilterMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0') + '-' + new Date().getFullYear());
  const [progressSearchQuery, setProgressSearchQuery] = useState('');
  const [selectedDoneProgress, setSelectedDoneProgress] = useState<ProgressData | null>(null);
  const [followups, setFollowups] = useState<FollowUpData[]>([]);
  const [progressList, setProgressList] = useState<ProgressData[]>([]);
  const [loading, setLoading] = useState(true);

  // CS Form State
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPic, setFormPic] = useState(''); // Empty by default for dynamic input
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [formCaption, setFormCaption] = useState('');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingScreenshotUrl, setExistingScreenshotUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Progress Form State
  const [selectedFollowupForProgress, setSelectedFollowupForProgress] = useState<FollowUpData | null>(null);
  const [progressOutcome, setProgressOutcome] = useState<ProgressOutcome | ''>('');
  const [progressChannels, setProgressChannels] = useState<ProgressChannel[]>([]);
  const [progressPic, setProgressPic] = useState('');
  const [progressDate, setProgressDate] = useState(new Date().toISOString().split('T')[0]);
  const [progressCaption, setProgressCaption] = useState('');
  const [progressFile, setProgressFile] = useState<File | null>(null);
  const [progressUploading, setProgressUploading] = useState(false);

  // Admin Tracking State
  const [searchPic, setSearchPic] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminCategory, setAdminCategory] = useState<'followups' | 'progress' | 'vouchers'>('followups');
  const [bulkDeleteMonth, setBulkDeleteMonth] = useState('');
  const [bulkDeleteCategory, setBulkDeleteCategory] = useState<'followups' | 'progress'>('followups');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Voucher State
  const [vouchers, setVouchers] = useState<VoucherData[]>([]);
  const [voucherCodeInput, setVoucherCodeInput] = useState('');
  const [scannedVoucher, setScannedVoucher] = useState<VoucherData | null>(null);
  const [isSearchingVoucher, setIsSearchingVoucher] = useState(false);
  const [voucherSearchStatus, setVoucherSearchStatus] = useState<'idle' | 'found' | 'not_found'>('idle');
  const [voucherRedeemPic, setVoucherRedeemPic] = useState('');
  const [voucherRedeemCustomerName, setVoucherRedeemCustomerName] = useState('');
  const [voucherRedeemCustomerPhone, setVoucherRedeemCustomerPhone] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [scanError, setScanError] = useState('');
  const [isScanningFile, setIsScanningFile] = useState(false);
  
  // Voucher Generate Form State
  const [genVoucherType, setGenVoucherType] = useState<VoucherType>(VoucherType.DISCOUNT_PERCENT);
  const [genVoucherValue, setGenVoucherValue] = useState('');
  const [genMinTransaction, setGenMinTransaction] = useState(0);
  const [genExpiryDate, setGenExpiryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30); // 30 days from now
    return d.toISOString().split('T')[0];
  });
  const [genQuantity, setGenQuantity] = useState(1);
  const [genCustomerName, setGenCustomerName] = useState('');
  const [genCustomerPhone, setGenCustomerPhone] = useState('');
  const [isGeneratingVouchers, setIsGeneratingVouchers] = useState(false);

  // Voucher Listing & Filtering State
  const [voucherListSearch, setVoucherListSearch] = useState('');
  const [voucherListFilterStatus, setVoucherListFilterStatus] = useState<'all' | 'active' | 'redeemed' | 'expired'>('all');
  const [selectedVoucherForPrint, setSelectedVoucherForPrint] = useState<VoucherData | null>(null);

  // Barcode Render Effect
  const barcodeRef = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (selectedVoucherForPrint && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, selectedVoucherForPrint.code, {
          format: "CODE128",
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 14,
          margin: 10
        });
      } catch (err) {
        console.error("Barcode generation error:", err);
      }
    }
  }, [selectedVoucherForPrint]);

  // Fetch data
  useEffect(() => {
    const qF = query(collection(db, 'followups'), orderBy('timestamp', 'desc'), limit(500));
    const unsubscribeF = onSnapshot(qF, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FollowUpData[];
      setFollowups(data);
      if (activeTab !== CATEGORIES[1]) setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'followups');
      setLoading(false);
    });

    const qP = query(collection(db, 'progress'), orderBy('timestamp', 'desc'), limit(500));
    const unsubscribeP = onSnapshot(qP, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProgressData[];
      setProgressList(data);
      if (activeTab !== CATEGORIES[2]) setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'progress');
      setLoading(false);
    });

    const qV = query(collection(db, 'vouchers'), limit(500));
    const unsubscribeV = onSnapshot(qV, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as VoucherData[];
      
      // Sort client-side by createdAt descending. Handle pending/null timestamps gracefully (put at top).
      data.sort((a, b) => {
        const getMs = (val: any) => {
          if (!val) return Date.now() + 10000; // Put newly created/pending local items at the top
          if (typeof val.toDate === 'function') return val.toDate().getTime();
          if (val.seconds) return val.seconds * 1000;
          if (val instanceof Date) return val.getTime();
          const parsed = Date.parse(val);
          return isNaN(parsed) ? 0 : parsed;
        };
        return getMs(b.createdAt) - getMs(a.createdAt);
      });
      
      setVouchers(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vouchers');
    });

    return () => {
      unsubscribeF();
      unsubscribeP();
      unsubscribeV();
    };
  }, [activeTab]);

  // Scanner Hook
  useEffect(() => {
    let qrScanner: any = null;
    let isMounted = true;
    let hasStarted = false;

    if (isScanning) {
      setScanError('');
      const element = document.getElementById('reader');
      if (element) {
        try {
          qrScanner = new Html5Qrcode("reader");
          const config = {
            fps: 15,
            qrbox: (width: number, height: number) => {
              const minSize = Math.min(width, height);
              let boxWidth = Math.floor(minSize * 0.8);
              if (boxWidth < 150) boxWidth = 150;
              let boxHeight = Math.floor(boxWidth * 0.45);
              if (boxHeight < 50) boxHeight = 50;
              return {
                width: boxWidth,
                height: boxHeight
              };
            }
          };

          qrScanner.start(
            { facingMode: cameraFacingMode },
            config,
            (decodedText: string) => {
              if (!isMounted) return;
              const cleanCode = decodedText.trim().toUpperCase();
              setVoucherCodeInput(cleanCode);
              setIsScanning(false);
              
              const found = vouchers.find(v => v.code === cleanCode);
              if (found) {
                setScannedVoucher(found);
                setVoucherSearchStatus('found');
                setSuccessMsg(`Voucher ${cleanCode} berhasil discan!`);
              } else {
                setScannedVoucher(null);
                setVoucherSearchStatus('not_found');
              }
            },
            () => {
              // Ignore frame failures
            }
          ).then(() => {
            if (isMounted) {
              hasStarted = true;
            } else {
              qrScanner.stop().catch((e: any) => console.log("Stopped scanner after unmount", e));
            }
          }).catch((err: any) => {
            if (isMounted) {
              console.error("Camera start failed:", err);
              if (err && (String(err).includes('NotReadableError') || String(err).includes('Could not start video source'))) {
                setScanError("Kamera sedang digunakan oleh aplikasi lain atau izin ditolak. Silakan tutup aplikasi kamera lain, segarkan halaman, atau coba gunakan tombol 'Buka Galeri'!");
              } else {
                setScanError("Kamera tidak dapat diakses. Silakan pastikan izin kamera diberikan atau pilih gambar barcode dari galeri.");
              }
            }
          });
        } catch (setupErr) {
          console.error("Scanner setup error:", setupErr);
          setScanError("Gagal menginisialisasi scanner.");
        }
      } else {
        const timer = setTimeout(() => {
          if (!isMounted) return;
          setScanError("Menghubungkan ke kamera...");
        }, 100);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      isMounted = false;
      if (qrScanner) {
        if (hasStarted) {
          qrScanner.stop().catch((err: any) => console.error("Error stopping camera safely", err));
        }
      }
    };
  }, [isScanning, cameraFacingMode, vouchers]);

  const handleScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError('');
    setIsScanningFile(true);
    setSuccessMsg('');
    setErrorMsg('');

    const tempDiv = document.createElement('div');
    tempDiv.id = 'temp-qr-reader';
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);

    try {
      const qrScanner = new Html5Qrcode('temp-qr-reader');
      const decodedText = await qrScanner.scanFile(file, true);
      
      const cleanCode = decodedText.trim().toUpperCase();
      setVoucherCodeInput(cleanCode);
      
      const found = vouchers.find(v => v.code === cleanCode);
      if (found) {
        setScannedVoucher(found);
        setVoucherSearchStatus('found');
        setVoucherRedeemCustomerName(found.customerName || '');
        setVoucherRedeemCustomerPhone(found.customerPhone || '');
        setSuccessMsg(`Voucher ${cleanCode} berhasil dideteksi dari galeri!`);
      } else {
        setScannedVoucher(null);
        setVoucherSearchStatus('not_found');
        setErrorMsg(`Voucher ${cleanCode} tidak ditemukan.`);
      }
    } catch (err: any) {
      console.error('Scan file error:', err);
      setErrorMsg('Gagal mendeteksi barcode/QR code dari gambar. Pastikan gambar jelas dan kode terlihat dengan baik.');
    } finally {
      setIsScanningFile(false);
      try {
        if (tempDiv && tempDiv.parentNode === document.body) {
          document.body.removeChild(tempDiv);
        }
      } catch (rmErr) {
        console.warn('Failed to remove temp div:', rmErr);
      }
      e.target.value = '';
    }
  };

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'dinalaundry21') {
      setIsAdminAuthenticated(true);
      setErrorMsg('');
    } else {
      setErrorMsg('Password admin salah!');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setErrorMsg('');
      try {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1024,
          useWebWorker: true,
        };
        const compressedFile = await imageCompression(file, options);
        setFormFile(compressedFile);
      } catch (error) {
        console.error('Compression error:', error);
        setErrorMsg('Gagal mengompres gambar.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If not editing, we MUST have a file. If editing, we can keep the old one.
    if (!formPic || !formCaption || !customerName || !customerPhone || (!formFile && !editingId)) {
      setErrorMsg('Semua field harus diisi.');
      return;
    }

    setUploading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let finalScreenshotUrl = existingScreenshotUrl;

      // 1. Upload to server if there's a new file
      if (formFile) {
        const formData = new FormData();
        formData.append('screenshot', formFile);
        formData.append('date', formDate);
        formData.append('pic', formPic);

        const uploadRes = await axios.post('/api/upload', formData);
        finalScreenshotUrl = uploadRes.data.url;

        if (!finalScreenshotUrl) {
          throw new Error('Gagal mendapatkan URL screenshot dari server.');
        }

        // If we were editing and uploaded a new file, we should delete the OLD one
        if (editingId && existingScreenshotUrl) {
           try {
             await axios.post('/api/delete-image', { screenshotUrl: existingScreenshotUrl });
           } catch (err) {
             console.warn('Failed to delete old image from Cloudinary:', err);
           }
        }
      }

      if (!finalScreenshotUrl) {
        throw new Error('Screenshot tidak ditemukan.');
      }

      // 2. Save to Firestore
      const monthYear = formDate.substring(5, 7) + '-' + formDate.substring(0, 4); // MM-YYYY
      
      const payload: any = {
        date: formDate,
        customerName: customerName,
        customerPhone: customerPhone,
        pic: formPic,
        caption: formCaption,
        screenshotUrl: finalScreenshotUrl,
        monthYear: monthYear,
        timestamp: serverTimestamp()
      };

      try {
        if (editingId) {
          await updateDoc(doc(db, 'followups', editingId), payload);
          setSuccessMsg('Data berhasil diperbarui!');
        } else {
          await addDoc(collection(db, 'followups'), payload);
          setSuccessMsg('Follow-up berhasil disimpan!');
        }
      } catch (fErr) {
        handleFirestoreError(fErr, editingId ? OperationType.UPDATE : OperationType.CREATE, 'followups');
      }

      // Reset form
      handleCancelEdit();
    } catch (error: any) {
      console.error('Submit error:', error);
      setErrorMsg(error.message || 'Gagal menyimpan data.');
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (f: FollowUpData) => {
    setEditingId(f.id || null);
    setFormDate(f.date);
    setCustomerName(f.customerName);
    setCustomerPhone(f.customerPhone);
    setFormPic(f.pic);
    setFormCaption(f.caption);
    setExistingScreenshotUrl(f.screenshotUrl);
    setFormFile(null); // Clear new file selection
    setErrorMsg('');
    setSuccessMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setExistingScreenshotUrl(null);
    setFormCaption('');
    setCustomerName('');
    setCustomerPhone('');
    setFormPic('');
    setFormFile(null);
    // Reset file input
    const fileInput = document.getElementById('screenshot-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (f: FollowUpData) => {
    if (!f.id) return;
    setConfirmDeleteId(f.id);
  };

  const executeDelete = async (f: FollowUpData) => {
    setDeletingIds(prev => new Set(prev).add(f.id!));
    setConfirmDeleteId(null);
    setErrorMsg('');
    setSuccessMsg('');
    
    try {
      // 1. Delete from Firestore first (primary data)
      await deleteDoc(doc(db, 'followups', f.id!));
      
      // 2. Attempt to delete from Cloudinary in background
      axios.post('/api/delete-image', { screenshotUrl: f.screenshotUrl }).catch(err => {
        console.warn('Background Cloudinary delete failed:', err);
      });
      
      setSuccessMsg('Data berhasil dihapus.');
      if (editingId === f.id) handleCancelEdit();
    } catch (error: any) {
      console.error('Delete error:', error);
      setErrorMsg(error.message || 'Gagal menghapus data.');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(f.id!);
        return next;
      });
    }
  };

  const filteredFollowups = useMemo(() => {
    return followups.filter(f => {
      const matchPic = f.pic.toLowerCase().includes(searchPic.toLowerCase());
      const matchMonth = filterMonth ? f.monthYear === filterMonth : true;
      const matchDate = filterDate ? f.date === filterDate : true;
      const matchCustomer = f.customerName?.toLowerCase().includes(searchPic.toLowerCase()) || 
                             f.customerPhone?.includes(searchPic);
      return (matchPic || matchCustomer) && matchMonth && matchDate;
    });
  }, [followups, searchPic, filterMonth, filterDate]);

  const pendingProgressFollowups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return followups.filter(f => {
      const fDate = new Date(f.date);
      fDate.setHours(0, 0, 0, 0);
      
      const diffTime = today.getTime() - fDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      const isOldEnough = diffDays >= 4;
      const isAlreadyProgressed = progressList.some(p => p.followupId === f.id);
      const matchMonth = progressFilterMonth ? f.monthYear === progressFilterMonth : true;
      
      return isOldEnough && !isAlreadyProgressed && matchMonth;
    });
  }, [followups, progressList, progressFilterMonth]);

  const doneProgressItems = useMemo(() => {
    return progressList.filter(p => {
      const matchMonth = progressFilterMonth ? p.monthYear === progressFilterMonth : true;
      return matchMonth;
    });
  }, [progressList, progressFilterMonth]);

  const doneProgressItemsFiltered = useMemo(() => {
    return doneProgressItems.filter(p => {
      const query = progressSearchQuery.trim().toLowerCase();
      if (!query) return true;
      const matchName = p.customerName ? p.customerName.toLowerCase().includes(query) : false;
      const matchPhone = p.customerPhone ? p.customerPhone.toLowerCase().includes(query) : false;
      return matchName || matchPhone;
    });
  }, [doneProgressItems, progressSearchQuery]);

  const filteredProgress = useMemo(() => {
    return progressList.filter(p => {
      const matchPic = p.pic.toLowerCase().includes(searchPic.toLowerCase());
      const matchMonth = filterMonth ? p.monthYear === filterMonth : true;
      const matchDate = filterDate ? p.date === filterDate : true;
      const matchCustomer = p.customerName?.toLowerCase().includes(searchPic.toLowerCase());
      return (matchPic || matchCustomer) && matchMonth && matchDate;
    });
  }, [progressList, searchPic, filterMonth, filterDate]);

  const filteredVouchersAdmin = useMemo(() => {
    return vouchers.filter(v => {
      let vDateStr = '';
      let vMonthYear = '';
      if (v.createdAt) {
        let d: Date | null = null;
        if (typeof v.createdAt.toDate === 'function') {
          d = v.createdAt.toDate();
        } else if (v.createdAt.seconds) {
          d = new Date(v.createdAt.seconds * 1000);
        } else if (v.createdAt instanceof Date) {
          d = v.createdAt;
        } else {
          d = new Date(v.createdAt);
        }
        
        if (d && !isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const date = String(d.getDate()).padStart(2, '0');
          vDateStr = `${year}-${month}-${date}`;
          vMonthYear = `${month}-${year}`;
        }
      }
      
      const matchSearch = searchPic.trim() === '' || 
        (v.code && v.code.toLowerCase().includes(searchPic.toLowerCase())) ||
        (v.customerName && v.customerName.toLowerCase().includes(searchPic.toLowerCase())) ||
        (v.customerPhone && v.customerPhone.includes(searchPic)) ||
        (v.redeemedBy && v.redeemedBy.toLowerCase().includes(searchPic.toLowerCase()));
        
      const matchMonth = filterMonth ? vMonthYear === filterMonth : true;
      const matchDate = filterDate ? vDateStr === filterDate : true;
      
      return matchSearch && matchMonth && matchDate;
    });
  }, [vouchers, searchPic, filterMonth, filterDate]);

  const handleProgressFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1200 });
        setProgressFile(compressed);
      } catch (e) {
        setErrorMsg('Gagal kompres gambar progress.');
      }
    }
  };

  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFollowupForProgress || !progressOutcome || !progressPic || !progressFile) {
      setErrorMsg('Lengkapi data progress dan upload bukti.');
      return;
    }

    setProgressUploading(true);
    try {
      // 1. Upload to Cloudinary folder "progress"
      const formData = new FormData();
      formData.append('screenshot', progressFile);
      formData.append('date', progressDate);
      formData.append('pic', progressPic);
      formData.append('targetFolder', 'progress');
      formData.append('customerName', selectedFollowupForProgress.customerName);

      const res = await axios.post('/api/upload', formData);
      const url = res.data.url;

      // 2. Save to Firestore
      const monthYear = progressDate.substring(5, 7) + '-' + progressDate.substring(0, 4);
      const payload: Omit<ProgressData, 'id'> = {
        followupId: selectedFollowupForProgress.id!,
        customerName: selectedFollowupForProgress.customerName,
        outcome: progressOutcome as ProgressOutcome,
        channels: progressChannels,
        pic: progressPic,
        date: progressDate,
        caption: progressCaption,
        screenshotUrl: url,
        monthYear,
        timestamp: serverTimestamp()
      };

      await addDoc(collection(db, 'progress'), payload);
      setSuccessMsg('Progress berhasil disimpan!');
      
      // Reset
      setSelectedFollowupForProgress(null);
      setProgressOutcome('');
      setProgressChannels([]);
      setProgressCaption('');
      setProgressFile(null);
    } catch (error: any) {
      setErrorMsg(error.message || 'Gagal simpan progress.');
    } finally {
      setProgressUploading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!bulkDeleteMonth) {
      setErrorMsg('Pilih bulan & tahun.');
      return;
    }
    if (!confirm(`Hapus SEMUA file Cloudinary di folder ${bulkDeleteCategory} untuk periode ${bulkDeleteMonth}?`)) return;

    setIsBulkDeleting(true);
    try {
      await axios.post('/api/bulk-delete', { 
        monthYear: bulkDeleteMonth, 
        category: bulkDeleteCategory 
      });
      setSuccessMsg('Bulk delete berhasil dilakukan.');
    } catch (e: any) {
      setErrorMsg('Gagal hapus massal: ' + e.message);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const downloadCSV = () => {
    const dataToExport = adminCategory === 'followups' ? filteredFollowups.map(f => ({
      Tanggal: f.date,
      Nama_Konsumen: f.customerName,
      No_HP: f.customerPhone,
      PIC: f.pic,
      Caption: f.caption,
      Bulan_Tahun: f.monthYear,
      URL_Screenshot: f.screenshotUrl
    })) : adminCategory === 'progress' ? filteredProgress.map(p => ({
      Tanggal_Progress: p.date,
      Nama_Konsumen: p.customerName,
      Hasil: p.outcome,
      Media: p.channels.join(', '),
      PIC: p.pic,
      Keterangan: p.caption,
      URL_Screenshot: p.screenshotUrl
    })) : filteredVouchersAdmin.map(v => {
      let createdDateStr = '-';
      if (v.createdAt) {
        let d: Date | null = null;
        if (typeof v.createdAt.toDate === 'function') {
          d = v.createdAt.toDate();
        } else if (v.createdAt.seconds) {
          d = new Date(v.createdAt.seconds * 1000);
        } else if (v.createdAt instanceof Date) {
          d = v.createdAt;
        } else {
          d = new Date(v.createdAt);
        }
        if (d && !isNaN(d.getTime())) {
          createdDateStr = d.toLocaleString('id-ID');
        }
      }

      return {
        Nama_Konsumen: v.customerName || '-',
        No_HP_Konsumen: v.customerPhone || '-',
        Kode_Voucher: v.code,
        Tipe_Benefit: v.type,
        Detail_Benefit: getVoucherBenefitText(v),
        Minimal_Transaksi: v.minTransaction || 0,
        Masa_Berlaku: v.expiryDate,
        Tanggal_Voucher_Dibuat: createdDateStr,
        Tanggal_Voucher_Diredeem: v.redeemedAt || '-',
        PIC_Penukar: v.redeemedBy || '-',
        Status_Penggunaan: v.isRedeemed ? 'Sudah Digunakan' : 'Belum Digunakan'
      };
    });

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    const filePrefix = adminCategory === 'followups' ? 'followup_awal' : adminCategory === 'progress' ? 'progress_followup' : 'data_voucher';
    link.setAttribute('download', `${filePrefix}_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Voucher Handlers
  const generateVoucherCode = (prefix = 'DINA') => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${randomPart}`;
  };

  const handleGenerateVouchers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genVoucherValue.trim()) {
      setErrorMsg('Nilai benefit tidak boleh kosong.');
      return;
    }
    
    setIsGeneratingVouchers(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const batchPromises = [];
      const createdCodes: string[] = [];
      
      for (let i = 0; i < genQuantity; i++) {
        let uniqueCode = '';
        let isUnique = false;
        let attempts = 0;
        
        while (!isUnique && attempts < 10) {
          uniqueCode = generateVoucherCode();
          const exists = vouchers.some(v => v.code === uniqueCode) || createdCodes.includes(uniqueCode);
          if (!exists) {
            isUnique = true;
          }
          attempts++;
        }
        
        createdCodes.push(uniqueCode);

        const payload = {
          code: uniqueCode,
          type: genVoucherType,
          value: genVoucherValue.trim(),
          minTransaction: Number(genMinTransaction) || 0,
          expiryDate: genExpiryDate,
          isRedeemed: false,
          customerName: genCustomerName.trim() || null,
          customerPhone: genCustomerPhone.trim() || null,
          createdAt: serverTimestamp(),
          redeemedAt: null,
          redeemedBy: null
        };
        
        batchPromises.push(addDoc(collection(db, 'vouchers'), payload));
      }

      await Promise.all(batchPromises);
      setSuccessMsg(`Berhasil membuat ${genQuantity} voucher baru!`);
      
      // Reset form
      setGenVoucherValue('');
      setGenMinTransaction(0);
      setGenCustomerName('');
      setGenCustomerPhone('');
      setGenQuantity(1);
    } catch (err: any) {
      console.error('Error generating vouchers:', err);
      handleFirestoreError(err, OperationType.CREATE, 'vouchers');
    } finally {
      setIsGeneratingVouchers(false);
    }
  };

  const handleSearchVoucher = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedCode = voucherCodeInput.trim().toUpperCase();
    if (!trimmedCode) {
      setScannedVoucher(null);
      setVoucherSearchStatus('idle');
      return;
    }

    setIsSearchingVoucher(true);
    const found = vouchers.find(v => v.code === trimmedCode);
    
    if (found) {
      setScannedVoucher(found);
      setVoucherSearchStatus('found');
      setVoucherRedeemCustomerName(found.customerName || '');
      setVoucherRedeemCustomerPhone(found.customerPhone || '');
    } else {
      setScannedVoucher(null);
      setVoucherSearchStatus('not_found');
    }
    setIsSearchingVoucher(false);
  };

  const handleRedeemVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedVoucher || !scannedVoucher.id) return;
    if (!voucherRedeemPic.trim()) {
      setErrorMsg('Nama PIC Penukar wajib diisi.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (scannedVoucher.expiryDate < todayStr) {
      setErrorMsg('Voucher ini sudah kedaluwarsa dan tidak bisa digunakan.');
      return;
    }

    try {
      const voucherRef = doc(db, 'vouchers', scannedVoucher.id);
      await updateDoc(voucherRef, {
        isRedeemed: true,
        redeemedAt: new Date().toISOString(),
        redeemedBy: voucherRedeemPic.trim(),
        customerName: voucherRedeemCustomerName.trim() || scannedVoucher.customerName,
        customerPhone: voucherRedeemCustomerPhone.trim() || scannedVoucher.customerPhone
      });

      setSuccessMsg(`Voucher ${scannedVoucher.code} berhasil ditukarkan!`);
      
      // Reset input fields
      setVoucherRedeemPic('');
      setVoucherRedeemCustomerName('');
      setVoucherRedeemCustomerPhone('');
      setVoucherCodeInput('');
      setVoucherSearchStatus('idle');
      setScannedVoucher(null);
    } catch (err: any) {
      console.error('Error redeeming voucher:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'vouchers');
    }
  };

  const handleDeleteVoucher = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus voucher ini?')) return;
    try {
      await deleteDoc(doc(db, 'vouchers', id));
      setSuccessMsg('Voucher berhasil dihapus.');
      if (scannedVoucher?.id === id) {
        setScannedVoucher(null);
        setVoucherSearchStatus('idle');
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, 'vouchers');
    }
  };

  const handlePrintVoucher = () => {
    const printContent = document.getElementById('printable-voucher-card');
    if (!printContent) return;
    
    const printWindow = window.open('', '', 'height=600,width=800');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Cetak Voucher Dina Laundry</title>');
      printWindow.document.write('<style>');
      printWindow.document.write(`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Playfair+Display:ital,wght@0,700;1,400&display=swap');
        body { font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: white; }
        .voucher-card { 
          border: 3px dashed #1e293b; 
          padding: 32px; 
          border-radius: 16px; 
          max-width: 450px; 
          text-align: center; 
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          background-color: #fafaf9;
        }
        .header { 
          font-family: 'Playfair Display', serif; 
          font-size: 28px; 
          font-weight: 800; 
          color: #1e293b; 
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }
        .subheader { 
          font-size: 11px; 
          color: #64748b; 
          text-transform: uppercase;
          letter-spacing: 0.15em;
          margin-bottom: 24px; 
          font-weight: 600;
        }
        .benefit-badge {
          background-color: #0f172a;
          color: white;
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          display: inline-block;
          margin-bottom: 12px;
        }
        .benefit-val { 
          font-size: 36px; 
          font-weight: 800; 
          color: #1e293b; 
          margin: 8px 0; 
          letter-spacing: -0.04em; 
          font-family: 'Playfair Display', serif;
        }
        .code-box { 
          font-family: monospace; 
          font-size: 20px; 
          font-weight: bold; 
          background-color: #f1f5f9; 
          padding: 8px 16px; 
          border: 1px solid #cbd5e1;
          border-radius: 8px; 
          display: inline-block; 
          margin-bottom: 16px; 
          letter-spacing: 0.05em;
          color: #0f172a;
        }
        .expiry { 
          font-size: 11px; 
          color: #475569; 
          font-weight: 500;
          margin-bottom: 12px; 
        }
        .barcode-container {
          margin: 20px auto;
          display: flex;
          justify-content: center;
        }
        .terms { 
          font-size: 9px; 
          color: #94a3b8; 
          line-height: 1.5; 
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
          margin-top: 16px;
        }
        @media print {
          body { background: none; }
          .voucher-card { box-shadow: none; border-color: #000; }
        }
      `);
      printWindow.document.write('<style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(printContent.outerHTML);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const handleShareVoucher = async () => {
    const cardElement = document.getElementById('printable-voucher-card');
    if (!cardElement || !selectedVoucherForPrint) {
      setErrorMsg('Voucher tidak ditemukan untuk dibagikan.');
      return;
    }

    try {
      // Create a canvas with high quality
      const canvas = await html2canvas(cardElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      // Convert to blob
      canvas.toBlob(async (blob) => {
        if (!blob || !selectedVoucherForPrint) {
          setErrorMsg('Gagal memproses gambar voucher.');
          return;
        }

        const file = new File([blob], `voucher-${selectedVoucherForPrint.code}.png`, { type: 'image/png' });
        const benefitText = getVoucherBenefitText(selectedVoucherForPrint);

        const textMessage = `*DINA LAUNDRY - Luxurious Laundry* 🧺✨\n\nHalo! Kami mengirimkan voucher promo spesial untuk Anda:\n🎁 *Benefit*: ${benefitText}\n🎫 *Kode Voucher*: *${selectedVoucherForPrint.code}*\n📅 *Berlaku hingga*: ${selectedVoucherForPrint.expiryDate}\n${selectedVoucherForPrint.minTransaction > 0 ? `🛒 *Min. Transaksi*: Rp ${selectedVoucherForPrint.minTransaction.toLocaleString()}\n` : ''}\nHarap tunjukkan barcode/kode voucher ini saat melakukan transaksi di Dina Laundry. Terima kasih! ❤️`;

        // Copy text to clipboard so it's ready to paste
        try {
          await navigator.clipboard.writeText(textMessage);
        } catch (clipErr) {
          console.warn("Clipboard write failed:", clipErr);
        }

        // Try utilizing Web Share API if supported by browser (e.g. mobile chrome/safari)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `Voucher Dina Laundry - ${selectedVoucherForPrint.code}`,
              text: textMessage,
            });
            setSuccessMsg('Voucher berhasil dibagikan!');
            return;
          } catch (shareErr: any) {
            if (shareErr.name === 'AbortError') {
              console.log('User cancelled sharing');
              return;
            }
            console.warn("Web Share failed, falling back to download & WhatsApp link:", shareErr);
          }
        }

        // Standard Fallback: Download file directly + Open WhatsApp prefilled chat
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `voucher-${selectedVoucherForPrint.code}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        let whatsappUrl = 'https://api.whatsapp.com/send';
        const phone = selectedVoucherForPrint.customerPhone || '';
        if (phone) {
          let cleanedPhone = phone.replace(/\D/g, '');
          if (cleanedPhone.startsWith('0')) {
            cleanedPhone = '62' + cleanedPhone.substring(1);
          }
          whatsappUrl += `?phone=${cleanedPhone}&text=${encodeURIComponent(textMessage)}`;
        } else {
          whatsappUrl += `?text=${encodeURIComponent(textMessage)}`;
        }

        window.open(whatsappUrl, '_blank');
        setSuccessMsg('Gambar voucher diunduh & teks promo disalin! Silakan paste gambar & kirim di WhatsApp.');
      }, 'image/png');

    } catch (err: any) {
      console.error('Error sharing voucher:', err);
      setErrorMsg('Gagal memproses gambar voucher: ' + err.message);
    }
  };

  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      const searchLower = voucherListSearch.toLowerCase().trim();
      if (!searchLower) return true; // If no search query, show all that match status filter

      const matchSearch = 
        (v.code && v.code.toLowerCase().includes(searchLower)) ||
        (v.customerName && v.customerName.toLowerCase().includes(searchLower)) ||
        (v.customerPhone && v.customerPhone.toLowerCase().includes(searchLower));
        
      if (!matchSearch) return false;
      return true;
    }).filter(v => {
      const todayStr = new Date().toISOString().split('T')[0];
      if (voucherListFilterStatus === 'active') {
        return !v.isRedeemed && v.expiryDate >= todayStr;
      } else if (voucherListFilterStatus === 'redeemed') {
        return v.isRedeemed;
      } else if (voucherListFilterStatus === 'expired') {
        return !v.isRedeemed && v.expiryDate < todayStr;
      }
      return true;
    });
  }, [vouchers, voucherListSearch, voucherListFilterStatus]);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-natural-bg overflow-hidden font-sans">
      {/* Mobile Top Navigation */}
      <header className="flex md:hidden flex-col border-b border-natural-border bg-white px-4 py-2.5 gap-2.5 w-full shrink-0 z-10 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-natural-primary rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-serif text-sm font-bold text-natural-text-dark leading-tight">Dina Laundry CS Tracking</h1>
              <p className="text-[8px] text-natural-text-muted uppercase tracking-wider">CS Follow-up Tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg border border-gray-100">
            <div className="w-5 h-5 rounded-full bg-natural-border flex items-center justify-center text-natural-text-dark font-bold text-[9px]">GP</div>
            <span className="text-[9px] font-semibold text-natural-text-dark">Gean</span>
          </div>
        </div>
        
        {/* Horizontal scrollable category list */}
        <nav 
          className="flex items-center gap-2 overflow-x-auto py-0.5 -mx-4 px-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {CATEGORIES.map((cat, idx) => {
            const isActive = activeTab === cat;
            return (
              <button
                key={`nav-item-mobile-${cat}`}
                onClick={() => {
                  setActiveTab(cat);
                  handleCancelEdit();
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-[0.97] ${
                  isActive 
                  ? 'bg-natural-primary text-white shadow-md shadow-natural-primary/10' 
                  : 'bg-gray-50 text-natural-text-muted border border-gray-100 hover:bg-gray-100'
                }`}
              >
                {idx === 0 ? <MessageSquare className="w-3.5 h-3.5" /> : idx === 1 ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx === 2 ? <Tag className="w-3.5 h-3.5" /> : <ListFilter className="w-3.5 h-3.5" />}
                {cat}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:w-64 border-r border-natural-border bg-white p-6 flex flex-col justify-between overflow-y-auto shrink-0">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-natural-primary rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-serif text-lg font-bold text-natural-text-dark leading-none">Dina Laundry CS Tracking</h1>
              <p className="text-[10px] text-natural-text-muted uppercase tracking-wider mt-1">CS Follow-up Tracker</p>
            </div>
          </div>
          
            <nav className="space-y-1">
            {CATEGORIES.map((cat, idx) => (
              <button
                key={`nav-item-${cat}`}
                onClick={() => {
                  setActiveTab(cat);
                  handleCancelEdit();
                }}
                className={`w-full sidebar-link-natural text-left gap-3 ${
                  activeTab === cat 
                  ? 'bg-natural-border text-natural-text-dark' 
                  : 'text-natural-sidebar-link hover:bg-gray-50'
                }`}
              >
                {idx === 0 ? <MessageSquare className="w-5 h-5" /> : idx === 1 ? <CheckCircle2 className="w-5 h-5" /> : idx === 2 ? <Tag className="w-5 h-5" /> : <ListFilter className="w-5 h-5" />}
                {cat}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-8 p-4 bg-gray-50 rounded-2xl border border-natural-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-natural-border flex items-center justify-center text-natural-text-dark font-bold text-xs">GP</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-natural-text-dark truncate">Gean Pratama</p>
              <p className="text-[10px] text-natural-text-muted">Created By</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {/* Global Messages */}
        <div className="max-w-7xl mx-auto mb-6">
          <AnimatePresence>
            {successMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0 }}
                className="mb-4 p-4 bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl font-medium flex items-center gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>{successMsg}</span>
                <button onClick={() => setSuccessMsg('')} className="ml-auto opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0 }}
                className="mb-4 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl font-medium flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="truncate max-w-md">{errorMsg}</span>
                <button onClick={() => setErrorMsg('')} className="ml-auto opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Image Preview Modal */}
        <AnimatePresence>
          {previewImageUrl && (
            <div 
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md cursor-zoom-out"
              onClick={() => setPreviewImageUrl(null)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  onClick={() => setPreviewImageUrl(null)}
                  className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 rounded-full"
                >
                  <X className="w-6 h-6" />
                </button>
                <img 
                  src={previewImageUrl} 
                  className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10" 
                  alt="Preview Screenshot"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Voucher Barcode & Print Modal */}
        <AnimatePresence>
          {selectedVoucherForPrint && (
            <div 
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
              onClick={() => setSelectedVoucherForPrint(null)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative bg-white max-w-md w-full rounded-2xl overflow-hidden shadow-2xl p-6 space-y-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <h3 className="font-serif text-lg font-bold text-natural-text-dark flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-natural-primary" />
                    Cetak / Tampilkan Barcode
                  </h3>
                  <button 
                    onClick={() => setSelectedVoucherForPrint(null)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* THE PRINTABLE CARD CONTAINER */}
                <div className="flex justify-center bg-gray-50 p-4 rounded-xl border border-dashed border-gray-200">
                  <div id="printable-voucher-card" className="voucher-card">
                    <div className="header">DINA LAUNDRY</div>
                    <div className="subheader">Luxurious Laundry</div>
                    
                    <div className="benefit-badge">Voucher Promo</div>
                    <div className="benefit-val">
                      {getVoucherBenefitText(selectedVoucherForPrint)}
                    </div>
                    
                    <div className="code-box">
                      {selectedVoucherForPrint.code}
                    </div>

                    <div className="expiry">
                      📅 Berlaku hingga: <span style={{ fontWeight: 600 }}>{selectedVoucherForPrint.expiryDate}</span>
                    </div>

                    {selectedVoucherForPrint.minTransaction > 0 && (
                      <div className="expiry" style={{ fontSize: '10px', marginTop: '-6px' }}>
                        🛒 Min. Transaksi: <span style={{ fontWeight: 600 }}>Rp {selectedVoucherForPrint.minTransaction.toLocaleString()}</span>
                      </div>
                    )}

                    {selectedVoucherForPrint.customerName && (
                      <div className="expiry" style={{ fontSize: '10px', marginTop: '-6px' }}>
                        👤 Khusus: <span style={{ fontWeight: 600 }}>{selectedVoucherForPrint.customerName} ({selectedVoucherForPrint.customerPhone})</span>
                      </div>
                    )}

                    <div className="barcode-container flex justify-center">
                      <svg ref={barcodeRef} className="barcode"></svg>
                    </div>

                    <div className="terms">
                      Harap tunjukkan barcode/kode voucher ini ke PIC Kasir Dina Laundry saat melakukan transaksi. Voucher hanya berlaku satu kali penggunaan sebelum batas waktu kedaluwarsa berakhir.
                    </div>
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedVoucherForPrint(null)}
                    className="py-3 px-4 bg-gray-100 hover:bg-gray-200 text-natural-text-dark font-bold rounded-xl text-sm transition-colors order-3 sm:order-1 sm:flex-1"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    onClick={handleShareVoucher}
                    className="py-3 px-4 bg-[#25D366] text-white font-bold rounded-xl text-sm hover:bg-[#20ba5a] shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] order-1 sm:order-2 sm:flex-1"
                  >
                    <Share2 className="w-4 h-4" />
                    Share WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintVoucher}
                    className="py-3 px-4 bg-natural-primary text-white font-bold rounded-xl text-sm hover:bg-opacity-95 shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] order-2 sm:order-3 sm:flex-1"
                  >
                    <Printer className="w-4 h-4" />
                    Cetak Voucher
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {confirmDeleteId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl shadow-red-200/50"
              >
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto text-red-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-natural-text-dark text-center mb-2">Konfirmasi Hapus</h3>
                <p className="text-sm text-natural-text-muted text-center mb-6">
                  Apakah Anda yakin ingin menghapus data ini? Data dan screenshotnya akan terhapus permanen dari sistem.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={() => {
                      const f = followups.find(x => x.id === confirmDeleteId);
                      if (f) executeDelete(f);
                    }}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-200 transition-all"
                  >
                    Hapus
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeTab === CATEGORIES[0] ? (
            <motion.div
              key="cs-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 xl:grid-cols-12 gap-8 content-start"
            >
              <header className="xl:col-span-12 mb-2">
                <div className="space-y-1">
                  <h2 className="font-serif text-3xl text-natural-text-dark">Input Follow-up</h2>
                  <p className="text-natural-text-muted">Masukan detail follow-up konsumen untuk hari ini.</p>
                </div>
              </header>

              <section className="xl:col-span-12">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                  <div className="flex-shrink-0 card-natural p-4 min-w-[200px] border-l-4 border-l-natural-primary bg-natural-primary/5">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Total Follow-up</p>
                    <p className="text-2xl font-bold text-natural-text-dark">{followups.length}</p>
                    <p className="text-[10px] text-natural-primary/70 font-medium whitespace-nowrap">Seluruh Data Aktif</p>
                  </div>
                  <div className="flex-shrink-0 card-natural p-4 min-w-[200px] border-l-4 border-l-amber-400">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Hari Ini</p>
                    <p className="text-2xl font-bold text-natural-text-dark">
                      {followups.filter(f => f.date === new Date().toISOString().split('T')[0]).length}
                    </p>
                    <p className="text-[10px] text-amber-600 font-medium whitespace-nowrap">Input Konsumen Baru</p>
                  </div>
                  <div className="flex-shrink-0 card-natural p-4 min-w-[200px] border-l-4 border-l-red-400">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Pending Progress</p>
                    <p className="text-2xl font-bold text-natural-text-dark">{pendingProgressFollowups.length}</p>
                    <p className="text-[10px] text-red-600 font-medium whitespace-nowrap">Belum di-Follow Lanjut</p>
                  </div>
                  <div className="flex-shrink-0 card-natural p-4 min-w-[200px] border-l-4 border-l-green-400">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Done Progress</p>
                    <p className="text-2xl font-bold text-natural-text-dark">{doneProgressItems.length}</p>
                    <p className="text-[10px] text-green-600 font-medium whitespace-nowrap">Sudah Terupdate</p>
                  </div>
                </div>
              </section>

              <section className="xl:col-span-5 self-start">
                <div className="card-natural p-6">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-6">
                    <h3 className="text-sm font-bold text-natural-text-dark uppercase tracking-wider">
                      {editingId ? 'Edit Data Follow-up' : 'Data Input Follow-up'}
                    </h3>
                    {editingId && (
                      <button 
                        onClick={handleCancelEdit}
                        className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:underline"
                      >
                        <X className="w-3 h-3" /> BATAL EDIT
                      </button>
                    )}
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">Tanggal</label>
                        <input 
                          type="date" 
                          value={formDate || ''}
                          onChange={(e) => setFormDate(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">PIC Follow-up</label>
                        <input 
                          type="text" 
                          placeholder="Nama PIC..."
                          value={formPic || ''}
                          onChange={(e) => setFormPic(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">Nama Konsumen</label>
                        <input 
                          type="text" 
                          placeholder="Nama Konsumen..."
                          value={customerName || ''}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">No. HP Konsumen</label>
                        <input 
                          type="text" 
                          placeholder="08123..."
                          value={customerPhone || ''}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-natural-text-muted">Caption / Hasil Follow-up</label>
                      <textarea 
                        rows={4}
                        placeholder="Tuliskan detail percakapan..."
                        value={formCaption || ''}
                        onChange={(e) => setFormCaption(e.target.value)}
                        className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none placeholder:text-gray-300"
                        required
                      ></textarea>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-natural-text-muted">Screenshoot Bukti</label>
                      <input 
                        type="file" 
                        id="screenshot-upload"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label 
                        htmlFor="screenshot-upload"
                        className={`block border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                          formFile 
                          ? 'border-natural-primary bg-natural-bg/50' 
                          : 'border-natural-border bg-gray-50 hover:border-natural-primary'
                        }`}
                      >
                        {formFile ? (
                          <div className="flex flex-col items-center gap-1">
                            <CheckCircle2 className="w-8 h-8 text-natural-primary" />
                            <p className="text-[11px] font-bold text-natural-text-dark">{formFile.name}</p>
                            <p className="text-[9px] text-natural-text-muted italic">Sudah dikompres otomatis</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-natural-text-muted">
                            <ImageIcon className="w-8 h-8 opacity-50" />
                            <p className="text-[11px] font-bold">Upload Bukti (Max 5MB)</p>
                            <p className="text-[9px] italic">Simpan ke Cloudinary</p>
                          </div>
                        )}
                      </label>
                    </div>

                    <button 
                      type="submit"
                      disabled={uploading}
                      className={`w-full py-3 rounded-xl font-semibold text-sm shadow-md mt-2 flex items-center justify-center gap-2 transition-all ${
                        editingId ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'btn-natural-primary'
                      }`}
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
                      {uploading ? 'Menyimpan...' : (editingId ? 'Perbarui Data Follow-up' : 'Submit & Simpan Cloudinary')}
                    </button>
                  </form>
                </div>
              </section>

              <section className="xl:col-span-7 space-y-6">
                <div className="card-natural flex flex-col h-full min-h-[400px]">
                  <div className="p-4 border-b border-gray-50 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-natural-text-dark uppercase tracking-wider">Aktivitas Terakhir</h3>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="grid divide-y divide-gray-50">
                      {loading ? (
                        <div className="py-20 text-center"><LoadingSpinner /></div>
                      ) : followups.length === 0 ? (
                        <div className="py-20 text-center text-natural-text-muted text-xs">Belum ada aktivitas.</div>
                      ) : (
                        followups.slice(0, 8).map((f, idx) => (
                          <div key={`aktivitas-${f.id || idx}`} className="group p-4 flex gap-4 hover:bg-gray-50/50 transition-colors relative">
                            <div className="relative group/img cursor-zoom-in" onClick={() => setPreviewImageUrl(f.screenshotUrl)}>
                              <img src={f.screenshotUrl} className="w-16 h-16 rounded-lg object-cover bg-gray-100 flex-shrink-0 border border-gray-100" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                <Search className="w-4 h-4 text-white" />
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold text-natural-text-dark">{f.date}</span>
                                <span className="text-[10px] text-natural-text-muted whitespace-nowrap italic">— {f.pic}</span>
                              </div>
                              <p className="text-[10px] font-bold text-natural-text-dark mb-0.5">{f.customerName}</p>
                              <p className="text-[10px] text-natural-text-dark line-clamp-1 leading-relaxed opacity-70">{f.caption}</p>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                              <button 
                                onClick={() => handleEdit(f)}
                                className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDelete(f)}
                                disabled={f.id ? deletingIds.has(f.id) : false}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  f.id && deletingIds.has(f.id) 
                                  ? 'bg-gray-100 text-gray-400' 
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                                }`}
                                title="Hapus"
                              >
                                {f.id && deletingIds.has(f.id) ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          ) : activeTab === CATEGORIES[1] ? (
            <motion.div
              key="progress-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 xl:grid-cols-12 gap-8 content-start"
            >
              <header className="xl:col-span-12 mb-2">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div className="space-y-1">
                    <h2 className="font-serif text-3xl text-natural-text-dark font-bold">Progress Follow-up</h2>
                    <p className="text-natural-text-muted">Pengecekan hasil follow-up setelah 4 hari.</p>
                  </div>
                  <div className="flex items-center gap-3 bg-white p-1 rounded-2xl shadow-sm border border-natural-border">
                    <button 
                      onClick={() => {
                        setActiveProgressSubTab('pending');
                        setSelectedFollowupForProgress(null);
                        setSelectedDoneProgress(null);
                      }}
                      className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        activeProgressSubTab === 'pending' 
                        ? 'bg-red-500 text-white shadow-lg shadow-red-200' 
                        : 'text-natural-text-muted hover:text-natural-text-dark'
                      }`}
                    >
                      Pending ({pendingProgressFollowups.length})
                    </button>
                    <button 
                      onClick={() => {
                        setActiveProgressSubTab('done');
                        setSelectedFollowupForProgress(null);
                        setSelectedDoneProgress(null);
                      }}
                      className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        activeProgressSubTab === 'done' 
                        ? 'bg-green-500 text-white shadow-lg shadow-green-200' 
                        : 'text-natural-text-muted hover:text-natural-text-dark'
                      }`}
                    >
                      Done ({doneProgressItems.length})
                    </button>
                    <div className="h-6 w-[1px] bg-gray-200 mx-2" />
                    <div className="relative group">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-text-muted group-focus-within:text-natural-primary transition-colors" />
                      <input 
                        type="text" 
                        placeholder="MM-YYYY"
                        value={progressFilterMonth}
                        onChange={(e) => setProgressFilterMonth(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl text-xs font-bold focus:bg-white focus:border-natural-primary outline-none transition-all w-32"
                      />
                    </div>
                  </div>
                </div>
              </header>

              {/* Progress Selection */}
              <section className="xl:col-span-4 space-y-4">
                <div className="card-natural p-6 flex flex-col h-[600px]">
                  <div className="flex items-center gap-2 border-b border-gray-50 pb-4 mb-4">
                    {activeProgressSubTab === 'pending' ? <ListFilter className="w-5 h-5 text-red-500" /> : <CheckCircle2 className="w-5 h-5 text-green-500" />}
                    <div>
                      <h3 className="text-sm font-bold text-natural-text-dark uppercase tracking-wider">
                        {activeProgressSubTab === 'pending' ? 'Belum Di-follow Lanjut' : 'Sudah Terupdate'}
                      </h3>
                      <p className="text-[10px] text-natural-text-muted">Periode: {progressFilterMonth || 'Semua'}</p>
                    </div>
                  </div>

                  {/* Sticky Search Bar (Only for Done Tab) */}
                  {activeProgressSubTab === 'done' && (
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-text-muted" />
                      <input 
                        type="text" 
                        placeholder="Cari nama atau nomor HP..."
                        value={progressSearchQuery}
                        onChange={(e) => setProgressSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-natural-border hover:border-gray-300 rounded-xl text-xs font-semibold focus:bg-white focus:border-natural-primary outline-none transition-all shadow-sm"
                      />
                      {progressSearchQuery && (
                        <button 
                          type="button"
                          onClick={() => setProgressSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-gray-200/50 text-gray-500 hover:text-gray-800 rounded-full flex items-center justify-center text-[10px] font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                    {activeProgressSubTab === 'pending' ? (
                      pendingProgressFollowups.length === 0 ? (
                        <div className="py-20 text-center text-natural-text-muted text-xs">
                          Tidak ada data pending di periode ini.
                        </div>
                      ) : (
                        pendingProgressFollowups.map((f, idx) => (
                          <button
                            key={`pending-${f.id || idx}`}
                            onClick={() => setSelectedFollowupForProgress(f)}
                            className={`w-full text-left p-4 rounded-xl border transition-all ${
                              selectedFollowupForProgress?.id === f.id
                              ? 'bg-natural-primary/10 border-natural-primary shadow-sm'
                              : 'bg-gray-50/50 border-transparent hover:border-gray-200 shadow-sm'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[9px] font-bold text-natural-text-muted uppercase tracking-tighter">{f.date}</span>
                              <span className="text-[9px] bg-white px-2 py-0.5 rounded border border-natural-border font-bold">{f.pic}</span>
                            </div>
                            <p className="font-bold text-natural-text-dark text-sm truncate">{f.customerName}</p>
                            <p className="text-[10px] text-natural-text-muted truncate mb-2">{f.customerPhone}</p>
                            <div className="flex items-center gap-1 text-natural-primary">
                              <span className="text-[8px] font-black uppercase tracking-widest">Update Sekarang</span>
                              <Plus className="w-3 h-3" />
                            </div>
                          </button>
                        ))
                      )
                    ) : (
                      doneProgressItemsFiltered.length === 0 ? (
                        <div className="py-20 text-center text-natural-text-muted text-xs font-medium">
                          {progressSearchQuery ? 'Tidak ada hasil pencarian.' : 'Belum ada progress di periode ini.'}
                        </div>
                      ) : (
                        doneProgressItemsFiltered.map((p, idx) => {
                          const isSelected = selectedDoneProgress?.id === p.id;
                          return (
                            <button
                              key={`done-${p.id || idx}`}
                              onClick={() => setSelectedDoneProgress(p)}
                              className={`w-full text-left p-4 rounded-xl border transition-all ${
                                isSelected
                                ? 'bg-green-500/10 border-green-500 shadow-sm'
                                : 'bg-gray-50/50 border-transparent hover:border-gray-200 shadow-sm'
                              }`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-[9px] font-bold text-natural-text-muted uppercase tracking-tighter">{p.date}</span>
                                <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${
                                  p.outcome === 'Ada feedback' ? 'bg-green-100 text-green-700' :
                                  p.outcome === 'Tidak ada respon' ? 'bg-red-100 text-red-700' :
                                  'bg-amber-100 text-amber-700'
                                }`}>{p.outcome}</span>
                              </div>
                              <p className="font-bold text-natural-text-dark text-sm truncate">{p.customerName}</p>
                              <p className="text-[10px] text-natural-text-muted truncate mb-2">{p.customerPhone}</p>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {p.channels.map((c) => (
                                  <span key={`done-ch-${p.id}-${c}`} className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded font-bold uppercase text-gray-600">{c}</span>
                                ))}
                              </div>
                              <div className="flex items-center gap-1 text-natural-primary mt-3 text-[9px] font-black uppercase tracking-widest hover:underline">
                                <span>Lihat Detail</span>
                                <Search className="w-3 h-3" />
                              </div>
                            </button>
                          );
                        })
                      )
                    )}
                  </div>
                </div>
              </section>

              {/* Progress Update Form */}
              <section className="xl:col-span-8 self-start">
                {activeProgressSubTab === 'pending' ? (
                  selectedFollowupForProgress ? (
                    <form onSubmit={handleProgressSubmit} className="card-natural p-8 space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div className="p-4 bg-natural-primary/5 rounded-2xl border border-natural-primary/10">
                            <h4 className="text-[10px] font-black text-natural-primary uppercase tracking-[0.2em] mb-4">Target Update</h4>
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-natural-primary font-bold text-lg border border-natural-primary/10">
                                {selectedFollowupForProgress.customerName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-lg font-serif font-bold text-natural-text-dark leading-tight">{selectedFollowupForProgress.customerName}</p>
                                <p className="text-xs text-natural-text-muted">{selectedFollowupForProgress.customerPhone}</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">Hasil Pengecekan</label>
                            <div className="grid gap-2">
                              {Object.values(ProgressOutcome).map((outcome) => (
                                <button
                                  key={`outcome-opt-${outcome}`}
                                  type="button"
                                  onClick={() => setProgressOutcome(outcome)}
                                  className={`w-full px-4 py-3 text-left rounded-xl text-xs font-semibold border transition-all flex items-center justify-between ${
                                    progressOutcome === outcome
                                    ? 'bg-natural-primary text-white border-natural-primary shadow-lg shadow-natural-primary/20'
                                    : 'bg-white text-natural-text-dark border-natural-border hover:bg-gray-50'
                                  }`}
                                >
                                  {outcome}
                                  {progressOutcome === outcome && <CheckCircle2 className="w-4 h-4" />}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">Media Feedback (Multiple)</label>
                            <div className="flex flex-wrap gap-2">
                              {Object.values(ProgressChannel).map((channel) => {
                                const isSelected = progressChannels.includes(channel);
                                return (
                                  <button
                                    key={`channel-opt-${channel}`}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) setProgressChannels(prev => prev.filter(c => c !== channel));
                                      else setProgressChannels(prev => [...prev, channel]);
                                    }}
                                    className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                                      isSelected
                                      ? 'bg-natural-text-dark text-white border-natural-text-dark'
                                      : 'bg-white text-natural-text-muted border-natural-border hover:border-natural-primary'
                                    }`}
                                  >
                                    {channel}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">PIC Progress</label>
                              <input 
                                type="text" 
                                placeholder="Nama Anda..."
                                value={progressPic}
                                onChange={(e) => setProgressPic(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                                required
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">Tanggal</label>
                              <input 
                                type="date" 
                                value={progressDate}
                                onChange={(e) => setProgressDate(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                                required
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">Keterangan Tambahan</label>
                            <textarea 
                              rows={3}
                              placeholder="Detail progress..."
                              value={progressCaption}
                              onChange={(e) => setProgressCaption(e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                            ></textarea>
                          </div>

                          <div className="space-y-1.5">
                            <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">Upload Bukti Progress</label>
                            <input 
                              type="file" 
                              id="progress-upload"
                              accept="image/*"
                              onChange={handleProgressFileUpload}
                              className="hidden"
                            />
                            <label 
                              htmlFor="progress-upload"
                              className={`block border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                                progressFile 
                                ? 'border-natural-primary bg-natural-primary/5' 
                                : 'border-natural-border bg-gray-50 hover:border-natural-primary hover:bg-white animate-soft-pulse'
                              }`}
                            >
                              {progressUploading ? (
                                <div className="flex flex-col items-center gap-2">
                                  <Loader2 className="w-8 h-8 animate-spin text-natural-primary" />
                                  <p className="text-[10px] font-bold text-natural-text-dark">Sedang Mengunggah...</p>
                                </div>
                              ) : progressFile ? (
                                <div className="flex flex-col items-center gap-1">
                                  <CheckCircle2 className="w-8 h-8 text-natural-primary" />
                                  <p className="text-[11px] font-bold text-natural-text-dark">{progressFile.name}</p>
                                  <p className="text-[9px] text-natural-text-muted italic">Format progress otomatis diaktifkan</p>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-2 text-natural-text-muted">
                                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-1">
                                    <Upload className="w-5 h-5 opacity-50" />
                                  </div>
                                  <p className="text-[11px] font-black uppercase tracking-[0.1em]">Klik untuk Unggah</p>
                                  <p className="text-[9px] italic opacity-70">Folder: Cloudinary/Progress</p>
                                </div>
                              )}
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-gray-50 flex gap-4">
                        <button 
                          type="button" 
                          onClick={() => setSelectedFollowupForProgress(null)}
                          className="px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all"
                        >
                          Batal
                        </button>
                        <button 
                          type="submit"
                          disabled={progressUploading}
                          className="flex-1 py-4 bg-natural-text-dark hover:bg-black text-white font-black uppercase tracking-[0.2em] text-sm rounded-xl shadow-xl shadow-gray-200 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                        >
                          {progressUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                          {progressUploading ? 'Memproses...' : 'Simpan Progress Follow-up'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="card-natural p-20 flex flex-col items-center justify-center text-center space-y-4 bg-natural-primary/5 border-dashed border-2 border-natural-primary/20">
                      <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center text-natural-primary">
                        <MessageSquare className="w-10 h-10 opacity-30" />
                      </div>
                      <div className="max-w-md">
                        <h3 className="font-serif text-2xl text-natural-text-dark">Pilih Data Untuk Update</h3>
                        <p className="text-sm text-natural-text-muted mt-2">
                          Silakan pilih salah satu data dari menu antrian 4 hari di sebelah kiri untuk melakukan update progress follow-up.
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  selectedDoneProgress ? (
                    <div className="card-natural p-8 space-y-8">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                        <div>
                          <span className="text-[10px] font-black uppercase text-green-600 tracking-[0.2em] bg-green-50 px-3 py-1 rounded-full border border-green-100">
                            Hasil Progress Follow-up (Selesai)
                          </span>
                        </div>
                        <button 
                          onClick={() => setSelectedDoneProgress(null)}
                          className="text-xs font-bold text-natural-text-muted hover:text-natural-text-dark bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors border border-gray-100 shadow-sm animate-fade-in"
                        >
                          Tutup Detail
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div className="p-5 bg-green-50/20 rounded-2xl border border-green-100/30">
                            <h4 className="text-[10px] font-black text-green-700 uppercase tracking-[0.2em] mb-4">Profil Konsumen</h4>
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-green-600 font-bold text-lg border border-green-100">
                                {selectedDoneProgress.customerName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-lg font-serif font-bold text-natural-text-dark leading-tight">{selectedDoneProgress.customerName}</p>
                                <p className="text-xs text-natural-text-muted mt-1">{selectedDoneProgress.customerPhone}</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Hasil Pengecekan</h4>
                            <div className="p-4 bg-gray-50 border border-natural-border rounded-xl">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                <span className="text-sm font-bold text-natural-text-dark">{selectedDoneProgress.outcome}</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Media Feedback yang Digunakan</h4>
                            <div className="flex flex-wrap gap-2">
                              {selectedDoneProgress.channels.length === 0 ? (
                                <span className="text-xs text-natural-text-muted italic">Tidak ada media feedback yang dicatat.</span>
                              ) : (
                                selectedDoneProgress.channels.map(channel => (
                                  <span 
                                    key={channel} 
                                    className="px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-natural-text-dark text-white shadow-sm"
                                  >
                                    {channel}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <h4 className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Nama PIC Progress</h4>
                              <div className="p-3 bg-gray-50 border border-natural-border rounded-xl text-sm font-semibold text-natural-text-dark shadow-sm">
                                {selectedDoneProgress.pic || '-'}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-xs font-black text-natural-text-muted uppercase tracking-wider font-semibold">Tanggal Progress</h4>
                              <div className="p-3 bg-gray-50 border border-natural-border rounded-xl text-sm font-semibold text-natural-text-dark shadow-sm">
                                {selectedDoneProgress.date || '-'}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <h4 className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Keterangan Tambahan</h4>
                            <div className="p-4 bg-gray-50 border border-natural-border rounded-xl text-sm text-natural-text-dark min-h-[100px] leading-relaxed whitespace-pre-wrap shadow-sm">
                              {selectedDoneProgress.caption || <span className="text-natural-text-muted italic">Tidak ada keterangan tambahan.</span>}
                            </div>
                          </div>

                          {selectedDoneProgress.screenshotUrl && (
                            <div className="space-y-2">
                              <h4 className="text-xs font-black text-natural-text-muted uppercase tracking-wider font-semibold">Bukti Progress</h4>
                              <div className="relative group overflow-hidden rounded-xl border border-natural-border bg-gray-50 cursor-zoom-in max-h-[160px] flex items-center justify-center shadow-sm" onClick={() => setPreviewImageUrl(selectedDoneProgress.screenshotUrl)}>
                                <img 
                                  src={selectedDoneProgress.screenshotUrl} 
                                  alt="Bukti Progress" 
                                  className="object-cover w-full h-36 transition-transform duration-300 group-hover:scale-105" 
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-x-0 bottom-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center py-2">
                                  <span className="text-white text-[9px] font-black uppercase tracking-widest bg-black/40 px-3 py-1 rounded-md">Klik Untuk Memperbesar</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="card-natural p-20 flex flex-col items-center justify-center text-center space-y-4 bg-natural-primary/5 border-dashed border-2 border-natural-primary/20">
                      <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center text-green-500">
                        <CheckCircle2 className="w-10 h-10 opacity-30" />
                      </div>
                      <div className="max-w-md">
                        <h3 className="font-serif text-2xl text-natural-text-dark">Pilih Data Progress</h3>
                        <p className="text-sm text-natural-text-muted mt-2">
                          Silakan pilih salah satu data dari sub menu Done di sebelah kiri untuk melihat detail progress follow-up yang telah disubmit.
                        </p>
                      </div>
                    </div>
                  )
                )}
              </section>
            </motion.div>
          ) : activeTab === CATEGORIES[2] ? (
            <motion.div
              key="voucher-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 xl:grid-cols-12 gap-8 content-start"
            >
              <header className="xl:col-span-12 mb-2">
                <div className="space-y-1">
                  <h2 className="font-serif text-3xl text-natural-text-dark font-bold">Voucher & Promo</h2>
                  <p className="text-natural-text-muted">Kelola pembuatan voucher diskon, cetak barcode, dan redeem voucher pelanggan.</p>
                </div>
              </header>

              {/* LEFT SIDE: SCAN & REDEEM (5 COLS) */}
              <section className="xl:col-span-5 space-y-6">
                <div className="card-natural p-6 space-y-6 bg-white rounded-2xl border border-natural-border shadow-sm">
                  <div className="border-b border-gray-100 pb-4">
                    <h3 className="font-serif text-xl font-bold text-natural-text-dark flex items-center gap-2">
                      <QrCode className="w-5 h-5 text-natural-primary" />
                      Redeem Voucher
                    </h3>
                    <p className="text-xs text-natural-text-muted mt-1">Cari kode voucher atau scan menggunakan kamera.</p>
                  </div>

                   <form onSubmit={handleSearchVoucher} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Kode Voucher</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Contoh: DINA-ABC123"
                          value={voucherCodeInput}
                          onChange={(e) => setVoucherCodeInput(e.target.value.toUpperCase())}
                          className="flex-1 px-4 py-3 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary font-mono text-lg uppercase"
                        />
                        <button
                          type="submit"
                          className="px-5 bg-natural-text-dark text-white font-bold rounded-xl text-sm hover:bg-black transition-colors"
                        >
                          Cari
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <label className="text-[10px] font-black text-natural-text-muted uppercase tracking-widest block">Metode Scan & Input</label>
                      <div className="grid grid-cols-3 gap-2">
                        {/* Kamera Belakang */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isScanning && cameraFacingMode === 'environment') {
                              setIsScanning(false);
                            } else {
                              setCameraFacingMode('environment');
                              setIsScanning(true);
                            }
                          }}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                            isScanning && cameraFacingMode === 'environment'
                            ? 'bg-natural-primary border-natural-primary text-white shadow-md shadow-natural-primary/10 scale-[0.98]'
                            : 'bg-gray-50 hover:bg-gray-100 border-natural-border text-natural-text-dark'
                          }`}
                        >
                          <Camera className="w-5 h-5 mb-1" />
                          <span className="text-[10px] font-bold leading-tight">Cam Belakang</span>
                        </button>

                        {/* Kamera Depan */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isScanning && cameraFacingMode === 'user') {
                              setIsScanning(false);
                            } else {
                              setCameraFacingMode('user');
                              setIsScanning(true);
                            }
                          }}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                            isScanning && cameraFacingMode === 'user'
                            ? 'bg-natural-primary border-natural-primary text-white shadow-md shadow-natural-primary/10 scale-[0.98]'
                            : 'bg-gray-50 hover:bg-gray-100 border-natural-border text-natural-text-dark'
                          }`}
                        >
                          <User className="w-5 h-5 mb-1" />
                          <span className="text-[10px] font-bold leading-tight">Cam Depan</span>
                        </button>

                        {/* Ambil dari Galeri */}
                        <button
                          type="button"
                          onClick={() => {
                            setIsScanning(false);
                            document.getElementById('qr-gallery-input')?.click();
                          }}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border border-natural-border bg-gray-50 hover:bg-gray-100 text-natural-text-dark text-center transition-all cursor-pointer ${
                            isScanningFile ? 'animate-pulse bg-natural-primary/10' : ''
                          }`}
                        >
                          {isScanningFile ? (
                            <Loader2 className="w-5 h-5 mb-1 text-natural-primary animate-spin" />
                          ) : (
                            <ImageIcon className="w-5 h-5 mb-1 text-natural-primary" />
                          )}
                          <span className="text-[10px] font-bold leading-tight">Buka Galeri</span>
                        </button>
                      </div>

                      {/* Hidden input for gallery */}
                      <input
                        type="file"
                        id="qr-gallery-input"
                        accept="image/*"
                        className="hidden"
                        onChange={handleScanFile}
                      />
                    </div>
                  </form>

                  {/* CAMERA STREAM BOX */}
                  <div className={`space-y-2 animate-fade-in border-t border-gray-100 pt-4 ${isScanning ? 'block' : 'hidden'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-natural-text-muted uppercase tracking-wider">
                        Live Scan: {cameraFacingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsScanning(false)}
                        className="text-[10px] font-bold text-red-500 hover:underline"
                      >
                        Matikan Kamera
                      </button>
                    </div>
                    <div id="reader" className="overflow-hidden rounded-2xl border-2 border-dashed border-natural-primary/30 bg-black min-h-[220px]"></div>
                    {scanError ? (
                      <p className="text-xs text-red-500 font-semibold text-center py-2">{scanError}</p>
                    ) : (
                      <p className="text-[10px] text-center text-natural-text-muted italic">Arahkan barcode / QR code voucher Anda ke kamera.</p>
                    )}
                  </div>

                  {/* VOUCHER SEARCH RESULTS & REDEMPTION FORM */}
                  {voucherSearchStatus !== 'idle' && (
                    <div className="border-t border-gray-100 pt-6 space-y-4 animate-fade-in">
                      {voucherSearchStatus === 'not_found' && (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
                          <AlertCircle className="w-5 h-5 text-red-500" />
                          <p className="text-xs text-red-700 font-semibold">Kode voucher "{voucherCodeInput}" tidak terdaftar dalam sistem.</p>
                        </div>
                      )}

                      {voucherSearchStatus === 'found' && scannedVoucher && (
                        <div className="space-y-4">
                          <div className={`p-5 rounded-2xl border ${
                            scannedVoucher.isRedeemed 
                            ? 'bg-gray-50 border-gray-200 text-gray-500' 
                            : new Date().toISOString().split('T')[0] > scannedVoucher.expiryDate
                            ? 'bg-red-50/50 border-red-100 text-red-700'
                            : 'bg-green-50/50 border-green-100 text-green-700'
                          }`}>
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest bg-white px-2 py-0.5 rounded-md shadow-sm border">
                                {scannedVoucher.type}
                              </span>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
                                scannedVoucher.isRedeemed 
                                ? 'bg-gray-200 text-gray-600'
                                : new Date().toISOString().split('T')[0] > scannedVoucher.expiryDate
                                ? 'bg-red-100 text-red-800'
                                : 'bg-green-100 text-green-800'
                              }`}>
                                {scannedVoucher.isRedeemed 
                                  ? 'TERPAKAI' 
                                  : new Date().toISOString().split('T')[0] > scannedVoucher.expiryDate
                                  ? 'EXPIRED'
                                  : 'AKTIF (SIAP REDEEM)'}
                              </span>
                            </div>

                            <p className="text-3xl font-serif font-black tracking-tight mb-2">
                              {scannedVoucher.type === VoucherType.DISCOUNT_PERCENT ? `${scannedVoucher.value}%` : 
                               scannedVoucher.type === VoucherType.NOMINAL ? `Rp ${Number(scannedVoucher.value).toLocaleString()}` : 
                               scannedVoucher.value}
                            </p>
                            <p className="text-xs font-mono font-bold tracking-wider">{scannedVoucher.code}</p>

                            <div className="mt-4 pt-3 border-t border-dashed border-gray-200/50 text-[11px] space-y-1">
                              <p>📅 Kedaluwarsa: <span className="font-semibold">{scannedVoucher.expiryDate}</span></p>
                              {scannedVoucher.minTransaction > 0 && (
                                <p>🛒 Min. Transaksi: <span className="font-semibold">Rp {scannedVoucher.minTransaction.toLocaleString()}</span></p>
                              )}
                              {scannedVoucher.customerName && (
                                <p>👤 Khusus Konsumen: <span className="font-semibold">{scannedVoucher.customerName} ({scannedVoucher.customerPhone})</span></p>
                              )}
                            </div>
                          </div>

                          {/* REDEEM ACTIONS FORM */}
                          {!scannedVoucher.isRedeemed && new Date().toISOString().split('T')[0] <= scannedVoucher.expiryDate ? (
                            <form onSubmit={handleRedeemVoucher} className="space-y-4 pt-2">
                              <div className="space-y-3">
                                <h4 className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Konfirmasi Penukaran</h4>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-natural-text-muted uppercase tracking-widest">Nama PIC Kasir *</label>
                                  <input
                                    type="text"
                                    placeholder="Nama PIC..."
                                    required
                                    value={voucherRedeemPic}
                                    onChange={(e) => setVoucherRedeemPic(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-natural-text-muted uppercase tracking-widest">Nama Konsumen (Opsional)</label>
                                    <input
                                      type="text"
                                      placeholder="Nama konsumen..."
                                      value={voucherRedeemCustomerName}
                                      onChange={(e) => setVoucherRedeemCustomerName(e.target.value)}
                                      className="w-full px-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-natural-text-muted uppercase tracking-widest">HP Konsumen (Opsional)</label>
                                    <input
                                      type="text"
                                      placeholder="No WhatsApp..."
                                      value={voucherRedeemCustomerPhone}
                                      onChange={(e) => setVoucherRedeemCustomerPhone(e.target.value)}
                                      className="w-full px-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm"
                                    />
                                  </div>
                                </div>
                              </div>

                              <button
                                type="submit"
                                className="w-full py-3.5 bg-green-600 text-white font-bold rounded-xl text-sm shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Redeem Voucher Sekarang
                              </button>
                            </form>
                          ) : scannedVoucher.isRedeemed ? (
                            <div className="p-4 bg-gray-100 rounded-xl text-xs space-y-2 text-gray-600 border border-gray-200">
                              <p className="font-bold">Informasi Penukaran:</p>
                              <p>👤 PIC Kasir: <span className="font-semibold">{scannedVoucher.redeemedBy}</span></p>
                              <p>📅 Tanggal Tukar: <span className="font-semibold">{scannedVoucher.redeemedAt ? new Date(scannedVoucher.redeemedAt).toLocaleString('id-ID') : '-'}</span></p>
                              {scannedVoucher.customerName && (
                                <p>👥 Konsumen: <span className="font-semibold">{scannedVoucher.customerName} ({scannedVoucher.customerPhone})</span></p>
                              )}
                            </div>
                          ) : (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-xs text-red-800 font-semibold">
                              Voucher ini sudah kedaluwarsa pada tanggal {scannedVoucher.expiryDate} dan tidak dapat digunakan lagi.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* RIGHT SIDE: GENERATOR & LIST (7 COLS) */}
              <section className="xl:col-span-7 space-y-6">
                {/* GENERATOR */}
                <div className="card-natural p-6 bg-white rounded-2xl border border-natural-border shadow-sm">
                  <div className="border-b border-gray-100 pb-4 mb-6">
                    <h3 className="font-serif text-xl font-bold text-natural-text-dark flex items-center gap-2">
                      <Ticket className="w-5 h-5 text-natural-primary" />
                      Generate Voucher Baru
                    </h3>
                    <p className="text-xs text-natural-text-muted mt-1">Buat voucher promo baru secara tunggal atau massal.</p>
                  </div>

                  <form onSubmit={handleGenerateVouchers} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Tipe Benefit</label>
                        <select
                          value={genVoucherType}
                          onChange={(e) => setGenVoucherType(e.target.value as VoucherType)}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm"
                        >
                          <option value={VoucherType.DISCOUNT_PERCENT}>Discount % (Diskon Persentase)</option>
                          <option value={VoucherType.NOMINAL}>Nominal Potongan (IDR)</option>
                          <option value={VoucherType.FREE_ITEM}>Free Item (Produk Gratis)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Nilai Benefit</label>
                        <input
                          type="text"
                          required
                          placeholder={genVoucherType === VoucherType.DISCOUNT_PERCENT ? "Contoh: 10 (artinya 10%)" : 
                                       genVoucherType === VoucherType.NOMINAL ? "Contoh: 15000" : "Contoh: Free Setrika 1kg"}
                          value={genVoucherValue}
                          onChange={(e) => setGenVoucherValue(e.target.value)}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Minimal Transaksi (Rp)</label>
                        <input
                          type="number"
                          value={genMinTransaction}
                          onChange={(e) => setGenMinTransaction(Number(e.target.value))}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Tanggal Kedaluwarsa</label>
                        <input
                          type="date"
                          required
                          value={genExpiryDate}
                          onChange={(e) => setGenExpiryDate(e.target.value)}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-50 pt-4">
                      <div className="space-y-1 md:col-span-1">
                        <label className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Jumlah Cetak</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={genQuantity}
                          onChange={(e) => setGenQuantity(Math.min(10, Math.max(1, Number(e.target.value))))}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm text-center font-bold"
                        />
                        <p className="text-[9px] text-natural-text-muted text-center mt-1">Maks. 10 voucher sekaligus</p>
                      </div>

                      <div className="space-y-1 md:col-span-1">
                        <label className="text-xs font-black text-natural-text-muted uppercase tracking-wider">Nama Konsumen (Opsional)</label>
                        <input
                          type="text"
                          placeholder="Konsumen khusus..."
                          value={genCustomerName}
                          onChange={(e) => setGenCustomerName(e.target.value)}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm"
                        />
                      </div>

                      <div className="space-y-1 md:col-span-1">
                        <label className="text-xs font-black text-natural-text-muted uppercase tracking-wider">No HP (Opsional)</label>
                        <input
                          type="text"
                          placeholder="No WA..."
                          value={genCustomerPhone}
                          onChange={(e) => setGenCustomerPhone(e.target.value)}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isGeneratingVouchers}
                      className="w-full py-3 bg-natural-primary text-white font-bold rounded-xl text-sm shadow-md hover:bg-opacity-95 transition-all flex items-center justify-center gap-2"
                    >
                      {isGeneratingVouchers ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Memproses pembuatan...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Generate & Simpan Voucher
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* VOUCHERS LIST */}
                <div className="card-natural p-6 bg-white rounded-2xl border border-natural-border shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                    <h3 className="font-serif text-lg font-bold text-natural-text-dark">Daftar Voucher ({filteredVouchers.length})</h3>
                    
                    <div className="flex gap-2">
                      <select
                        value={voucherListFilterStatus}
                        onChange={(e) => setVoucherListFilterStatus(e.target.value as any)}
                        className="px-3 py-1.5 bg-white border border-natural-border rounded-lg text-xs font-semibold focus:outline-none"
                      >
                        <option value="all">Semua Status</option>
                        <option value="active">Aktif</option>
                        <option value="redeemed">Terpakai</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Cari voucher berdasarkan kode, nama atau nomor konsumen..."
                      value={voucherListSearch}
                      onChange={(e) => setVoucherListSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-natural-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-natural-primary"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                  </div>

                  {/* SCROLLABLE LIST */}
                  <div className="overflow-y-auto max-h-[350px] space-y-2.5 pr-1">
                    {filteredVouchers.length === 0 ? (
                      <div className="p-8 text-center text-xs text-natural-text-muted italic bg-gray-50 rounded-xl border border-dashed">
                        Tidak ada voucher yang ditemukan.
                      </div>
                    ) : (
                      filteredVouchers.map((v) => {
                        const todayStr = new Date().toISOString().split('T')[0];
                        const isExpired = !v.isRedeemed && v.expiryDate < todayStr;
                        return (
                          <div
                            key={v.id}
                            className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                              v.isRedeemed
                              ? 'bg-gray-50/50 border-gray-100 opacity-65'
                              : isExpired
                              ? 'bg-red-50/30 border-red-100'
                              : 'bg-white border-natural-border shadow-sm hover:border-natural-primary/30'
                            }`}
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-xs text-natural-text-dark bg-gray-100 px-2 py-0.5 rounded border">
                                  {v.code}
                                </span>
                                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                  v.isRedeemed
                                  ? 'bg-gray-200 text-gray-600'
                                  : isExpired
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-green-100 text-green-700'
                                }`}>
                                  {v.isRedeemed ? 'Terpakai' : isExpired ? 'Expired' : 'Aktif'}
                                </span>
                                <span className="text-[9px] text-natural-text-muted">{v.type}</span>
                              </div>

                              <p className="text-sm font-serif font-black text-natural-text-dark">
                                {v.type === VoucherType.DISCOUNT_PERCENT ? `Diskon ${v.value}%` : 
                                 v.type === VoucherType.NOMINAL ? `Potongan Rp ${Number(v.value).toLocaleString()}` : 
                                 v.value}
                              </p>

                              <div className="text-[9px] text-natural-text-muted space-y-0.5 mt-1">
                                <p>📅 Kedaluwarsa: {v.expiryDate}</p>
                                {v.customerName && <p>👤 Konsumen: {v.customerName} ({v.customerPhone})</p>}
                                {v.isRedeemed && <p>✅ Diredeem oleh PIC: {v.redeemedBy}</p>}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => setSelectedVoucherForPrint(v)}
                                className="p-2 bg-gray-50 hover:bg-gray-100 text-natural-text-dark border rounded-xl shadow-sm transition-colors"
                                title="Cetak / Tampilkan Barcode"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteVoucher(v.id!)}
                                className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors"
                                title="Hapus Voucher"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </section>
            </motion.div>
          ) : (
            <motion.div
              key="admin-tracking"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {!isAdminAuthenticated ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <form onSubmit={handleAdminAuth} className="card-natural p-8 max-w-sm w-full space-y-6">
                    <div className="text-center space-y-2">
                       <AlertCircle className="w-12 h-12 text-natural-primary mx-auto opacity-20" />
                       <h2 className="font-serif text-2xl text-natural-text-dark">Akses Terbatas</h2>
                       <p className="text-xs text-natural-text-muted">Masukkan password admin dinalaundry21 untuk melihat tracking.</p>
                    </div>
                    <div className="space-y-2">
                      <input 
                        type="password" 
                        placeholder="Password..."
                        value={adminPassword || ''}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-center tracking-widest"
                      />
                      {errorMsg && <p className="text-[10px] text-red-500 font-bold text-center">{errorMsg}</p>}
                    </div>
                    <button className="w-full py-3 btn-natural-primary rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98]">
                      Buka Akses Admin
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-gray-100 mb-8">
                    <div className="space-y-1">
                      <h2 className="font-serif text-4xl text-natural-text-dark tracking-tight font-bold">Admin Tracking Center</h2>
                      <div className="flex items-center gap-4 mt-4">
                        <button 
                          onClick={() => setAdminCategory('followups')}
                          className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                            adminCategory === 'followups'
                            ? 'bg-natural-primary text-white border-natural-primary shadow-lg shadow-natural-primary/20'
                            : 'bg-white text-natural-text-muted border-natural-border hover:border-natural-primary'
                          }`}
                        >
                          Follow-up Awal
                        </button>
                        <button 
                          onClick={() => setAdminCategory('progress')}
                          className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                            adminCategory === 'progress'
                            ? 'bg-natural-text-dark text-white border-natural-text-dark shadow-lg shadow-gray-200'
                            : 'bg-white text-natural-text-muted border-natural-border hover:border-natural-primary'
                          }`}
                        >
                          Data Progress
                        </button>
                        <button 
                          onClick={() => setAdminCategory('vouchers')}
                          className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                            adminCategory === 'vouchers'
                            ? 'bg-natural-primary text-white border-natural-primary shadow-lg shadow-natural-primary/20'
                            : 'bg-white text-natural-text-muted border-natural-border hover:border-natural-primary'
                          }`}
                        >
                          Data Voucher
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="bg-red-50 p-4 rounded-2xl border border-red-100 flex items-center gap-4">
                        <div>
                          <p className="text-[9px] font-black uppercase text-red-600 tracking-wider">Cloudinary Cleanup</p>
                          <div className="flex items-center gap-2 mt-1">
                            <input 
                              type="text" 
                              placeholder="MM-YYYY" 
                              value={bulkDeleteMonth} 
                              onChange={(e) => setBulkDeleteMonth(e.target.value)} 
                              className="w-24 px-2 py-1 bg-white border border-red-200 rounded text-xs focus:outline-none" 
                            />
                            <select 
                              value={bulkDeleteCategory} 
                              onChange={(e) => setBulkDeleteCategory(e.target.value as any)}
                              className="px-2 py-1 bg-white border border-red-200 rounded text-xs focus:outline-none"
                            >
                              <option value="followups">Followup</option>
                              <option value="progress">Progress</option>
                            </select>
                            <button 
                              onClick={handleBulkDelete}
                              disabled={isBulkDeleting}
                              className="p-1 px-3 bg-red-600 text-white rounded font-bold text-[10px] hover:bg-red-700 transition-colors"
                            >
                              {isBulkDeleting ? '...' : 'Hapus Massal'}
                            </button>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={downloadCSV}
                        className="flex items-center gap-2 bg-natural-text-dark text-white px-6 py-4 rounded-2xl hover:opacity-90 transition-all font-black text-xs shadow-2xl"
                      >
                        <Download className="w-4 h-4" /> Export {adminCategory === 'followups' ? 'Followups' : adminCategory === 'progress' ? 'Progress' : 'Vouchers'} (.CSV)
                      </button>
                    </div>
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 card-natural p-5 shadow-sm">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-text-muted"><Search className="w-4 h-4" /></span>
                      <input type="text" placeholder="Cari PIC/Konsumen..." value={searchPic || ''} onChange={(e) => setSearchPic(e.target.value)} className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-natural-primary" />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-text-muted"><Calendar className="w-4 h-4" /></span>
                      <input type="date" value={filterDate || ''} onChange={(e) => setFilterDate(e.target.value)} className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-natural-primary" />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-text-muted"><ListFilter className="w-4 h-4" /></span>
                      <input type="text" placeholder="MM-YYYY (e.g. 04-2026)" value={filterMonth || ''} onChange={(e) => setFilterMonth(e.target.value)} className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-natural-primary" />
                    </div>
                    <div className="flex items-center justify-end">
                      <span className="text-[10px] font-black text-natural-text-muted tracking-[0.2em] uppercase">Showing {adminCategory === 'followups' ? filteredFollowups.length : adminCategory === 'progress' ? filteredProgress.length : filteredVouchersAdmin.length} results</span>
                    </div>
                  </div>

                  <div className="card-natural overflow-hidden mt-6">
                    <div className="overflow-x-auto">
                      {adminCategory === 'followups' ? (
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-gray-50 text-[10px] uppercase font-black text-natural-text-muted border-b border-natural-border">
                            <tr>
                              <th className="px-6 py-5">Tanggal</th>
                              <th className="px-6 py-5">Konsumen</th>
                              <th className="px-6 py-5">WhatsApp/HP</th>
                              <th className="px-6 py-5">PIC</th>
                              <th className="px-6 py-5">Keterangan</th>
                              <th className="px-6 py-5 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="text-xs text-natural-text-dark divide-y divide-gray-50">
                            {filteredFollowups.map((f, idx) => (
                              <tr key={`admin-f-${f.id || idx}`} className="hover:bg-natural-bg/30 transition-colors">
                                <td className="px-6 py-4 font-semibold">{f.date}</td>
                                <td className="px-6 py-4 font-bold">{f.customerName}</td>
                                <td className="px-6 py-4">{f.customerPhone}</td>
                                <td className="px-6 py-4 italic">{f.pic}</td>
                                <td className="px-6 py-4 max-w-[200px] truncate">{f.caption}</td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <button 
                                      onClick={() => setPreviewImageUrl(f.screenshotUrl)}
                                      className="text-natural-primary font-bold hover:underline"
                                    >
                                      Detail
                                    </button>
                                    <button onClick={() => { setActiveTab(CATEGORIES[0]); handleEdit(f); }} className="text-amber-500 hover:text-amber-600 transition-colors">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => handleDelete(f)} 
                                      disabled={f.id ? deletingIds.has(f.id) : false}
                                      className={`${f.id && deletingIds.has(f.id) ? 'text-gray-400' : 'text-red-500 hover:text-red-600'} transition-colors`}
                                    >
                                      {f.id && deletingIds.has(f.id) ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : adminCategory === 'progress' ? (
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-natural-text-dark text-[10px] uppercase font-black text-white/70 border-b border-white/10">
                            <tr>
                              <th className="px-6 py-5">Tanggal Progress</th>
                              <th className="px-6 py-5">Konsumen</th>
                              <th className="px-6 py-5">Hasil</th>
                              <th className="px-6 py-5">Media</th>
                              <th className="px-6 py-5">PIC Progress</th>
                              <th className="px-6 py-5 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="text-xs text-natural-text-dark divide-y divide-gray-50">
                            {filteredProgress.map((p, idx) => (
                              <tr key={`admin-p-${p.id || idx}`} className="hover:bg-natural-bg/30 transition-colors">
                                <td className="px-6 py-4 font-semibold">{p.date}</td>
                                <td className="px-6 py-4 font-bold">{p.customerName}</td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-1 rounded text-[9px] font-bold ${
                                    p.outcome === ProgressOutcome.ADA_FEEDBACK ? 'bg-green-100 text-green-700' :
                                    p.outcome === ProgressOutcome.TIDAK_ADA_RESPON ? 'bg-red-100 text-red-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {p.outcome}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-wrap gap-1">
                                    {p.channels.map((c) => (
                                      <span key={`admin-pr-ch-${p.id}-${c}`} className="text-[8px] bg-gray-100 px-1 rounded uppercase font-bold">{c}</span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-6 py-4 italic font-medium">{p.pic}</td>
                                <td className="px-6 py-4 text-right">
                                  <button 
                                    onClick={() => setPreviewImageUrl(p.screenshotUrl)}
                                    className="text-natural-primary font-bold hover:underline"
                                  >
                                    Lihat Bukti
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-natural-primary text-[10px] uppercase font-black text-white border-b border-natural-primary/10">
                            <tr>
                              <th className="px-6 py-5">Kode Voucher</th>
                              <th className="px-6 py-5">Konsumen</th>
                              <th className="px-6 py-5">Benefit</th>
                              <th className="px-6 py-5">Masa Berlaku</th>
                              <th className="px-6 py-5">Status</th>
                              <th className="px-6 py-5 text-right">Penukar</th>
                            </tr>
                          </thead>
                          <tbody className="text-xs text-natural-text-dark divide-y divide-gray-50">
                            {filteredVouchersAdmin.map((v, idx) => {
                              const isExpired = v.expiryDate < new Date().toISOString().split('T')[0];
                              return (
                                <tr key={`admin-v-${v.id || idx}`} className="hover:bg-natural-bg/30 transition-colors">
                                  <td className="px-6 py-4 font-mono font-bold text-natural-primary">{v.code}</td>
                                  <td className="px-6 py-4">
                                    {v.customerName ? (
                                      <div>
                                        <p className="font-bold">{v.customerName}</p>
                                        <p className="text-[10px] text-natural-text-muted">{v.customerPhone}</p>
                                      </div>
                                    ) : (
                                      <span className="text-natural-text-muted">-</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 font-semibold">{getVoucherBenefitText(v)}</td>
                                  <td className="px-6 py-4">{v.expiryDate}</td>
                                  <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                      v.isRedeemed ? 'bg-gray-200 text-gray-600' :
                                      isExpired ? 'bg-red-100 text-red-700' :
                                      'bg-green-100 text-green-700'
                                    }`}>
                                      {v.isRedeemed ? 'Terpakai' : isExpired ? 'Expired' : 'Aktif'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    {v.isRedeemed ? (
                                      <div>
                                        <p className="font-bold">{v.redeemedBy || 'PIC Kasir'}</p>
                                        <p className="text-[9px] text-natural-text-muted">{v.redeemedAt || ''}</p>
                                      </div>
                                    ) : (
                                      <span className="text-natural-text-muted">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center space-x-2">
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
    </div>
  );
}
