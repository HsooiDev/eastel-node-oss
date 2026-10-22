"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminDialog } from "@/components/admin/dialog";
import { Badge } from "@/components/ui/badge";
import { Pencil, Send, Trash2 } from "lucide-react";

interface Campaign {
  id: number;
  name: string;
  discount_type: "fixed" | "percent";
  discount_value: string;
  min_spend: string;
  max_discount: string | null;
  validity_days: number;
  is_welcome: number;
  is_active: number;
  created_at: string;
}

interface IssuedVoucher {
  id: number;
  code: string;
  discount_type: "fixed" | "percent";
  discount_value: string;
  status: "active" | "redeemed" | "expired";
  order_id: number | null;
  redeemed_amount: string | null;
  issued_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  customer_email: string | null;
  customer_name: string | null;
}

export default function VouchersPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [issued, setIssued] = useState<IssuedVoucher[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingIssued, setLoadingIssued] = useState(true);
  const [issuedFilter, setIssuedFilter] = useState("");
  const [showCampModal, setShowCampModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);

  // Campaign Form State
  const [campForm, setCampForm] = useState({
    id: 0,
    name: "",
    discount_type: "fixed",
    discount_value: "",
    min_spend: "0",
    max_discount: "",
    validity_days: 30,
    is_welcome: false,
    is_active: true,
  });

  // Issue Voucher Form State
  const [issueForm, setIssueForm] = useState({
    campaign_id: 0,
    campaign_name: "",
    email: "",
  });

  const [savingCampaign, setSavingCampaign] = useState(false);
  const [issuingVoucher, setIssuingVoucher] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const res = await fetch("/api/admin/vouchers?action=list_campaigns");
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
    } catch {}
    setLoadingCampaigns(false);
  }, []);

  const fetchIssued = useCallback(async () => {
    setLoadingIssued(true);
    try {
      const url = `/api/admin/vouchers?action=list_issued${issuedFilter ? `&status=${issuedFilter}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.vouchers) setIssued(data.vouchers);
    } catch {}
    setLoadingIssued(false);
  }, [issuedFilter]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    fetchIssued();
  }, [fetchIssued]);

  const handleOpenNewCampaign = () => {
    setCampForm({
      id: 0,
      name: "",
      discount_type: "fixed",
      discount_value: "",
      min_spend: "0",
      max_discount: "",
      validity_days: 30,
      is_welcome: false,
      is_active: true,
    });
    setShowCampModal(true);
  };

  const handleOpenEditCampaign = (c: Campaign) => {
    setCampForm({
      id: c.id,
      name: c.name,
      discount_type: c.discount_type,
      discount_value: Number(c.discount_value).toString(),
      min_spend: Number(c.min_spend).toString(),
      max_discount: c.max_discount ? Number(c.max_discount).toString() : "",
      validity_days: c.validity_days,
      is_welcome: c.is_welcome === 1,
      is_active: c.is_active === 1,
    });
    setShowCampModal(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campForm.name.trim()) return;
    setSavingCampaign(true);
    try {
      const res = await fetch("/api/admin/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_campaign",
          ...campForm,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setShowCampModal(false);
        fetchCampaigns();
      } else {
        alert(data.message || "Failed to save campaign.");
      }
    } catch {
      alert("Failed to save campaign.");
    }
    setSavingCampaign(false);
  };

  const handleDeleteCampaign = async (id: number) => {
    if (!confirm("Are you sure you want to delete this campaign? Existing customer vouchers will not be affected.")) return;
    try {
      const res = await fetch("/api/admin/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_campaign", id }),
      });
      const data = await res.json();
      if (data.status === "success") {
        fetchCampaigns();
      } else {
        alert(data.message || "Failed to delete campaign.");
      }
    } catch {}
  };

  const handleOpenIssueModal = (c: Campaign) => {
    setIssueForm({
      campaign_id: c.id,
      campaign_name: c.name,
      email: "",
    });
    setShowIssueModal(true);
  };

  const handleIssueVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueForm.email.trim()) return;
    setIssuingVoucher(true);
    try {
      const res = await fetch("/api/admin/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issue_to_email",
          campaign_id: issueForm.campaign_id,
          email: issueForm.email.trim(),
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        alert(`Voucher successfully issued: ${data.code}`);
        setShowIssueModal(false);
        fetchIssued();
      } else {
        alert(data.message || "Failed to issue voucher.");
      }
    } catch {
      alert("Failed to issue voucher.");
    }
    setIssuingVoucher(false);
  };

  const formatDiscount = (type: "fixed" | "percent", value: string) => {
    return type === "percent" ? `${parseFloat(value)}%` : `RM${parseFloat(value).toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Voucher Campaigns</h1>
        <Button onClick={handleOpenNewCampaign}>+ New Campaign</Button>
      </div>

      {/* Campaigns Grid */}
      {loadingCampaigns ? (
        <p className="text-on-surface-variant">Loading campaigns...</p>
      ) : campaigns.length === 0 ? (
        <p className="text-on-surface-variant italic">No campaigns found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {campaigns.map((c) => (
            <Card key={c.id} className={`overflow-hidden transition-all ${c.is_welcome ? 'ring-2 ring-primary bg-primary/5' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  <CardTitle className="text-lg font-bold">{c.name}</CardTitle>
                  <div className="flex flex-col gap-1 items-end">
                    {c.is_welcome === 1 && <Badge variant="primary">WELCOME</Badge>}
                    <Badge variant={c.is_active === 1 ? "success" : "secondary"}>
                      {c.is_active === 1 ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm space-y-1 text-on-surface-variant">
                  <div>Discount: <strong className="text-on-surface">{formatDiscount(c.discount_type, c.discount_value)}</strong></div>
                  <div>Min Spend: <strong className="text-on-surface">RM{parseFloat(c.min_spend).toFixed(2)}</strong></div>
                  {c.max_discount && (
                    <div>Max Discount: <strong className="text-on-surface">RM{parseFloat(c.max_discount).toFixed(2)}</strong></div>
                  )}
                  <div>Validity: <strong className="text-on-surface">{c.validity_days} days</strong></div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="secondary" onClick={() => handleOpenEditCampaign(c)}><Pencil size={16} aria-hidden="true" />Edit</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleOpenIssueModal(c)}><Send size={16} aria-hidden="true" />Issue</Button>
                  <Button size="sm" variant="danger" aria-label={`Delete ${c.name}`} onClick={() => handleDeleteCampaign(c.id)}><Trash2 size={16} aria-hidden="true" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Issued Vouchers Header */}
      <div className="flex items-center justify-between mt-10">
        <h1 className="text-2xl font-bold text-on-surface">Issued Vouchers</h1>
        <select
          value={issuedFilter}
          onChange={(e) => setIssuedFilter(e.target.value)}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="redeemed">Redeemed</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {/* Issued Vouchers Table */}
      <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface-container/30">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container/60 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                <th className="px-6 py-4">Code</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Discount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Issued At</th>
                <th className="px-6 py-4">Expires At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60 text-sm text-on-surface">
              {loadingIssued ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-on-surface-variant">Loading issued vouchers...</td>
                </tr>
              ) : issued.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-on-surface-variant">No vouchers found.</td>
                </tr>
              ) : (
                issued.map((v) => (
                  <tr key={v.id} className="hover:bg-surface-container/20">
                    <td className="px-6 py-4 font-mono font-bold text-primary">{v.code}</td>
                    <td className="px-6 py-4">
                      <span className="block font-medium">{v.customer_name || "—"}</span>
                      <span className="block text-xs text-on-surface-variant font-mono">{v.customer_email || "—"}</span>
                    </td>
                    <td className="px-6 py-4 font-medium">{formatDiscount(v.discount_type, v.discount_value)}</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={
                          v.status === "redeemed"
                            ? "secondary"
                            : v.status === "expired"
                            ? "danger"
                            : "success"
                        }
                      >
                        {v.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-xs text-on-surface-variant">
                      {new Date(v.issued_at).toLocaleString("en-MY", { dateStyle: "medium" })}
                    </td>
                    <td className="px-6 py-4 text-xs text-on-surface-variant">
                      {v.expires_at ? new Date(v.expires_at).toLocaleString("en-MY", { dateStyle: "medium" }) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign Add/Edit Modal */}
      {showCampModal && (
        <AdminDialog open={showCampModal} canDismiss={!savingCampaign} onClose={() => setShowCampModal(false)} title={campForm.id ? "Edit Campaign" : "New Campaign"}>
            <form onSubmit={handleSaveCampaign}>
              <CardContent className="space-y-4">
                <Input
                  label="Campaign Name"
                  placeholder="e.g. Welcome Voucher"
                  value={campForm.name}
                  onChange={(e) => setCampForm({ ...campForm, name: e.target.value })}
                  required
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-on-surface mb-1">Discount Type</label>
                    <select
                      aria-label="Discount type"
                      value={campForm.discount_type}
                      onChange={(e) => setCampForm({ ...campForm, discount_type: e.target.value })}
                      className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
                    >
                      <option value="fixed">Fixed (RM)</option>
                      <option value="percent">Percent (%)</option>
                    </select>
                  </div>
                  <Input
                    label="Value"
                    type="number"
                    step="0.01"
                    placeholder="5.00"
                    value={campForm.discount_value}
                    onChange={(e) => setCampForm({ ...campForm, discount_value: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Min Spend (RM)"
                    type="number"
                    step="0.01"
                    value={campForm.min_spend}
                    onChange={(e) => setCampForm({ ...campForm, min_spend: e.target.value })}
                  />
                  <Input
                    label="Max Discount (RM, percent only)"
                    type="number"
                    step="0.01"
                    placeholder="No limit"
                    value={campForm.max_discount}
                    onChange={(e) => setCampForm({ ...campForm, max_discount: e.target.value })}
                    disabled={campForm.discount_type === "fixed"}
                  />
                </div>
                <Input
                  label="Validity Days (from issue date)"
                  type="number"
                  value={campForm.validity_days}
                  onChange={(e) => setCampForm({ ...campForm, validity_days: parseInt(e.target.value) || 0 })}
                  required
                />
                
                <div className="flex flex-col gap-3 pt-2">
                  <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      checked={campForm.is_welcome}
                      onChange={(e) => setCampForm({ ...campForm, is_welcome: e.target.checked })}
                      className="rounded border-outline bg-surface-container-lowest text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>Auto-issue to new customers (welcome campaign)</span>
                  </label>

                  <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      checked={campForm.is_active}
                      onChange={(e) => setCampForm({ ...campForm, is_active: e.target.checked })}
                      className="rounded border-outline bg-surface-container-lowest text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>Campaign Active</span>
                  </label>
                </div>
              </CardContent>
              <div className="p-6 border-t border-outline-variant flex justify-end gap-2">
                <Button type="button" variant="secondary" disabled={savingCampaign} onClick={() => setShowCampModal(false)}>Cancel</Button>
                <Button type="submit" loading={savingCampaign}>Save Campaign</Button>
              </div>
            </form>
        </AdminDialog>
      )}

      {/* Manual Voucher Issue Modal */}
      {showIssueModal && (
        <AdminDialog open={showIssueModal} canDismiss={!issuingVoucher} onClose={() => setShowIssueModal(false)} title="Issue Voucher">
            <form onSubmit={handleIssueVoucher}>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Campaign</label>
                  <p className="text-on-surface font-semibold">{issueForm.campaign_name}</p>
                </div>
                <Input
                  label="Customer Email"
                  type="email"
                  placeholder="customer@example.com"
                  value={issueForm.email}
                  onChange={(e) => setIssueForm({ ...issueForm, email: e.target.value })}
                  required
                />
              </CardContent>
              <div className="p-6 border-t border-outline-variant flex justify-end gap-2">
                <Button type="button" variant="secondary" disabled={issuingVoucher} onClick={() => setShowIssueModal(false)}>Cancel</Button>
                <Button type="submit" loading={issuingVoucher}>Issue Voucher</Button>
              </div>
            </form>
        </AdminDialog>
      )}
    </div>
  );
}
