"use client";

import { useState, useEffect } from "react";
import { TTBForm, generateFormHash } from "@/data/mockForms";

export default function FormsAdminPage() {
  const [forms, setForms] = useState<TTBForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingForm, setEditingForm] = useState<Partial<TTBForm> | null>(null);

  const fetchForms = async () => {
    try {
      const res = await fetch("/api/forms", {
        headers: { "x-access-key": localStorage.getItem("access_key") || "" }
      });
      const data = await res.json();
      if (data.forms) {
        setForms(data.forms);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this form?")) return;
    try {
      await fetch(`/api/forms?id=${id}`, {
        method: "DELETE",
        headers: { "x-access-key": localStorage.getItem("access_key") || "" }
      });
      fetchForms();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingForm) return;

    // Auto-generate hash if creating or updating core fields
    const updatedForm = {
      ...editingForm,
      hash: generateFormHash(editingForm.brandName || "", editingForm.classType || "", editingForm.netContents || "")
    };

    const isNew = !forms.find(f => f.id === updatedForm.id);
    
    try {
      await fetch("/api/forms", {
        method: isNew ? "POST" : "PUT",
        headers: { 
          "Content-Type": "application/json",
          "x-access-key": localStorage.getItem("access_key") || ""
        },
        body: JSON.stringify(updatedForm)
      });
      setEditingForm(null);
      fetchForms();
    } catch (e) {
      console.error(e);
    }
  };

  const openNewFormModal = () => {
    setEditingForm({
      id: `FORM-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      status: "Pending",
      brandName: "",
      classType: "",
      alcvol: 0,
      proof: 0,
      netContents: "",
      governmentWarning: "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.",
      producerName: ""
    });
  };

  if (loading) return <div className="p-12 text-center">Loading database...</div>;

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <div className="max-w-[1200px] mx-auto space-y-6">
        <header className="flex justify-between items-center border-b pb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Database Manager</h1>
            <p className="text-gray-600 mt-2">Add, edit, or delete mock TTB forms for testing.</p>
          </div>
          <div className="flex gap-4">
            <button onClick={openNewFormModal} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors text-sm">
              + New Form
            </button>
            <a href="/" className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold py-2 px-4 rounded-lg shadow-sm transition-colors text-sm flex items-center">
              Back to Prototype
            </a>
          </div>
        </header>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-500 uppercase font-bold text-xs">
              <tr>
                <th className="px-6 py-3">ID / Status</th>
                <th className="px-6 py-3">Brand & Class</th>
                <th className="px-6 py-3">Volume & Proof</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {forms.map(form => (
                <tr key={form.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{form.id}</div>
                    <span className={`inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-bold uppercase tracking-wider ${form.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {form.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold">{form.brandName}</div>
                    <div className="text-gray-500">{form.classType}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div>{form.netContents}</div>
                    <div className="text-gray-500">{form.alcvol}% / {form.proof} Proof</div>
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button onClick={() => setEditingForm(form)} className="text-blue-600 hover:text-blue-800 font-bold">Edit</button>
                    <button onClick={() => handleDelete(form.id)} className="text-red-600 hover:text-red-800 font-bold">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {forms.length === 0 && <div className="p-8 text-center text-gray-500">No forms found in the database.</div>}
        </div>
      </div>

      {editingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border my-8">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h2 className="text-xl font-bold">Edit Form: {editingForm.id}</h2>
              <button onClick={() => setEditingForm(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Brand Name</label>
                  <input required type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={editingForm.brandName || ""} onChange={e => setEditingForm({...editingForm, brandName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Class/Type</label>
                  <input required type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={editingForm.classType || ""} onChange={e => setEditingForm({...editingForm, classType: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Net Contents</label>
                  <input required type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={editingForm.netContents || ""} onChange={e => setEditingForm({...editingForm, netContents: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Producer Name</label>
                  <input required type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={editingForm.producerName || ""} onChange={e => setEditingForm({...editingForm, producerName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">ABV (%)</label>
                  <input required type="number" step="0.1" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={editingForm.alcvol || 0} onChange={e => setEditingForm({...editingForm, alcvol: parseFloat(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Proof</label>
                  <input required type="number" step="0.1" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={editingForm.proof || 0} onChange={e => setEditingForm({...editingForm, proof: parseFloat(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Contact Email</label>
                  <input type="email" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={editingForm.contactEmail || ""} onChange={e => setEditingForm({...editingForm, contactEmail: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Status</label>
                  <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={editingForm.status} onChange={e => setEditingForm({...editingForm, status: e.target.value as any})}>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Government Warning</label>
                <textarea required rows={4} className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={editingForm.governmentWarning || ""} onChange={e => setEditingForm({...editingForm, governmentWarning: e.target.value})} />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t">
                <button type="button" onClick={() => setEditingForm(null)} className="px-4 py-2 font-bold text-gray-600 hover:bg-gray-100 rounded transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 font-bold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">Save Form</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
