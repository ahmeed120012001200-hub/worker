(function(){
	const key = 'production_workers_v1';
	const dailyKey = 'daily_summaries_v1';
	let records = [];
	let currentIndex = -1;
	let lastDeleted = null;
	let filterQuery = '';

	// sorting / pagination state
	let sortField = 'date';
	let sortDir = 'desc';
	let pageSize = 25;
	let currentPage = 1;

	// elements
	const workerNumber = document.getElementById('workerNumber');
	const workerName = document.getElementById('workerName');
	const product = document.getElementById('product');
	const quantity = document.getElementById('quantity');
	const dateEl = document.getElementById('date');
	const comments = document.getElementById('comments');

	const newRecordBtn = document.getElementById('newRecordBtn');
	const newBtn = document.getElementById('newBtn');
	const saveBtn = document.getElementById('saveBtn');
	const addNewBtn = document.getElementById('addNewBtn'); // may be null if not in HTML
	const deleteBtn = document.getElementById('deleteBtn');
	const restoreBtn = document.getElementById('restoreBtn');
	const prevBtn = document.getElementById('prevBtn');
	const nextBtn = document.getElementById('nextBtn');
	const criteriaBtn = document.getElementById('criteriaBtn');
	const closeBtn = document.getElementById('closeBtn');

	const searchInput = document.getElementById('searchInput');
	const clearSearchBtn = document.getElementById('clearSearch');
	const exportBtn = document.getElementById('exportBtn');
	const clearBtn = document.getElementById('clearBtn');

	const calcSummaryBtn = document.getElementById('calcSummaryBtn');
	const exportSummaryBtn = document.getElementById('exportSummaryBtn');

	const tableBody = document.querySelector('#recordsTable tbody');

	// helpers
	function load(){
		const raw = localStorage.getItem(key);
		records = raw ? JSON.parse(raw) : [];
		if(records.length) currentIndex = 0;
		else currentIndex = -1;
		renderTable();
		populateForm();
	}
	function saveAll(){
		localStorage.setItem(key, JSON.stringify(records));
		renderTable();
	}
	function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

	// UI
	function populateForm(){
		if(currentIndex >= 0 && records[currentIndex]){
			const r = records[currentIndex];
			workerNumber.value = r.workerNumber || '';
			workerName.value = r.workerName || '';
			product.value = r.product || '';
			quantity.value = r.quantity || '';
			dateEl.value = r.date || '';
			comments.value = r.comments || '';
			highlightRow(currentIndex);
		} else {
			clearForm();
		}
	}
	function clearForm(){
		workerNumber.value = '';
		workerName.value = '';
		product.value = '';
		quantity.value = '';
		dateEl.value = '';
		comments.value = '';
		unhighlightAll();
		currentIndex = -1;
	}
	function getFormData(){
		return {
			workerNumber: workerNumber.value.trim(),
			workerName: workerName.value.trim(),
			product: product.value.trim(),
			quantity: Number(quantity.value) || 0,
			date: dateEl.value,
			comments: comments.value.trim(),
			created: new Date().toISOString()
		};
	}

	// duplicate check
	function findDuplicateByNumberAndDate(num, date, excludeIndex){
		if(!num || !date) return -1;
		const targetNum = num.trim().toLowerCase();
		for(let i=0;i<records.length;i++){
			if(i === excludeIndex) continue;
			const rnum = (records[i].workerNumber || '').trim().toLowerCase();
			const rdate = records[i].date || '';
			if(rnum && rnum === targetNum && rdate === date) return i;
		}
		return -1;
	}

	function propagateWorkerNameToAll(num, name){
		if(!num || name === undefined) return;
		const target = num.trim().toLowerCase();
		for(let i=0;i<records.length;i++){
			const rnum = (records[i].workerNumber || '').trim().toLowerCase();
			if(rnum && rnum === target){
				records[i].workerName = name;
			}
		}
	}

	// filtering / sorting / pagination
	function computeFilteredIndexes(){
		if(!filterQuery) return records.map((_,i)=>i);
		const q = filterQuery.toLowerCase();
		const res = [];
		for(let i=0;i<records.length;i++){
			const r = records[i];
			if((r.workerNumber||'').toString().toLowerCase().includes(q) ||
			   (r.workerName||'').toString().toLowerCase().includes(q) ||
			   (r.product||'').toString().toLowerCase().includes(q) ||
			   (r.comments||'').toString().toLowerCase().includes(q)){
				res.push(i);
			}
		}
		return res;
	}
	function compareForSort(a,b,field){
		const va = (a[field] === undefined || a[field] === null) ? '' : a[field];
		const vb = (b[field] === undefined || b[field] === null) ? '' : b[field];
		if(field === 'date') return (va > vb) ? 1 : (va < vb ? -1 : 0);
		if(field === 'quantity') return Number(va) - Number(vb);
		return va.toString().localeCompare(vb.toString(), undefined, {sensitivity:'base'});
	}
	function computeDisplayedIndexes(){
		const filtered = computeFilteredIndexes();
		const items = filtered.map(i => ({ idx:i, rec: records[i] }));
		items.sort((x,y)=>{
			const cmp = compareForSort(x.rec, y.rec, sortField);
			return sortDir === 'asc' ? cmp : -cmp;
		});
		const total = items.length;
		const totalPages = Math.max(1, Math.ceil(total / pageSize));
		if(currentPage > totalPages) currentPage = totalPages;
		const start = (currentPage -1) * pageSize;
		const pageItems = items.slice(start, start + pageSize).map(it => it.idx);
		const pageInfo = document.getElementById('pageInfo');
		const totalCountEl = document.getElementById('totalCount');
		if(pageInfo) pageInfo.textContent = `${currentPage} / ${totalPages}`;
		if(totalCountEl) totalCountEl.textContent = `إجمالي: ${total}`;
		return { indexes: pageItems, total, totalPages };
	}

	// render table
	function renderTable(){
		tableBody.innerHTML = '';
		const res = computeDisplayedIndexes();
		const indexes = res.indexes;
		indexes.forEach((origIndex)=>{
			const r = records[origIndex];
			const tr = document.createElement('tr');
			if(origIndex === currentIndex) tr.classList.add('selected');
			tr.innerHTML = `
				<td class="row-actions">
					<button class="edit" data-i="${origIndex}">Edit</button>
					<button class="clone" data-i="${origIndex}">Clone</button>
				</td>
				<td title="${escapeHtml(r.comments)}">${escapeHtml(r.comments)}</td>
				<td>${r.date || ''}</td>
				<td>${r.quantity || ''}</td>
				<td title="${escapeHtml(r.product)}">${escapeHtml(r.product)}</td>
				<td title="${escapeHtml(r.workerName)}">${escapeHtml(r.workerName)}</td>
				<td title="${escapeHtml(r.workerNumber)}">${escapeHtml(r.workerNumber)}</td>
			`;
			tr.addEventListener('click', ()=>{ currentIndex = origIndex; populateForm(); });
			const editBtn = tr.querySelector('button.edit');
			const cloneBtn = tr.querySelector('button.clone');
			if(editBtn) editBtn.addEventListener('click', function(e){ e.stopPropagation(); editRecord(origIndex); });
			if(cloneBtn) cloneBtn.addEventListener('click', function(e){ e.stopPropagation(); cloneRecord(origIndex); });
			tableBody.appendChild(tr);
		});
		// update header aria-sort
		document.querySelectorAll('#recordsTable thead th[data-sort]').forEach(th=>{
			const f = th.getAttribute('data-sort');
			th.setAttribute('aria-sort', f === sortField ? (sortDir === 'asc' ? 'asc' : 'desc') : 'none');
		});
	}

	// row helpers
	function highlightRow(i){
		Array.from(tableBody.children).forEach((tr,idx)=> {
			tr.classList.toggle('selected', idx===i);
		});
	}
	function unhighlightAll(){
		Array.from(tableBody.children).forEach(tr=>tr.classList.remove('selected'));
	}

	// record operations
	function editRecord(index){
		if(index < 0 || index >= records.length) return;
		currentIndex = index;
		populateForm();
		workerNumber.focus();
	}
	function cloneRecord(index){
		if(index < 0 || index >= records.length) return;
		const src = records[index];
		const copy = Object.assign({}, src, { created: new Date().toISOString() });
		records.push(copy);
		currentIndex = records.length - 1;
		saveAll();
		populateForm();
	}

	function actionNew(){
		clearForm();
		workerNumber.focus();
	}
	function actionNewRecord(){
		const r = { workerNumber:'', workerName:'', product:'', quantity:0, date:'', comments:'' };
		records.push(r);
		currentIndex = records.length - 1;
		saveAll();
		populateForm();
	}
	function actionSave(){
		const data = getFormData();
		if(!data.workerNumber && !data.workerName && !data.product){
			alert('أكمل على الأقل رقم العامل أو اسم العامل أو المنتج.');
			return;
		}
		if(data.workerNumber && data.date){
			const dupIdx = findDuplicateByNumberAndDate(data.workerNumber, data.date, currentIndex);
			if(dupIdx !== -1 && dupIdx !== currentIndex){
				alert('يوجد سجل لنفس رقم العامل في نفس التاريخ. لا يمكن تكرار السجل لنفس التاريخ.');
				currentIndex = dupIdx;
				populateForm();
				return;
			}
		}
		if(currentIndex >=0 && records[currentIndex]){
			records[currentIndex] = Object.assign(records[currentIndex], data);
		} else {
			records.push(data);
			currentIndex = records.length -1;
		}
		if(data.workerNumber && data.workerName){
			propagateWorkerNameToAll(data.workerNumber, data.workerName);
		}
		saveAll();
		populateForm();
	}
	function actionSaveAsNew(){
		const data = getFormData();
		if(!data.workerNumber && !data.workerName && !data.product){
			alert('أكمل على الأقل رقم العامل أو اسم العامل أو المنتج.');
			return;
		}
		records.push(data);
		currentIndex = records.length - 1;
		saveAll();
		populateForm();
	}
	function actionDelete(){
		if(currentIndex < 0 || !records[currentIndex]) return alert('لا يوجد سجل محدد للحذف.');
		if(!confirm('حذف السجل المحدد؟')) return;
		lastDeleted = { item: records[currentIndex], index: currentIndex };
		records.splice(currentIndex,1);
		if(records.length === 0) currentIndex = -1;
		else currentIndex = Math.min(currentIndex, records.length-1);
		saveAll();
		populateForm();
	}
	function actionRestore(){
		if(!lastDeleted) return alert('لا يوجد شيء لاستعادته.');
		records.splice(lastDeleted.index, 0, lastDeleted.item);
		currentIndex = lastDeleted.index;
		lastDeleted = null;
		saveAll();
		populateForm();
	}
	function actionPrev(){
		if(records.length === 0) return;
		if(currentIndex <= 0) currentIndex = records.length -1;
		else currentIndex--;
		populateForm();
	}
	function actionNext(){
		if(records.length === 0) return;
		if(currentIndex >= records.length -1) currentIndex = 0;
		else currentIndex++;
		populateForm();
	}
	function actionCriteria(){
		const q = prompt('Search by product, worker name or number (partial match):');
		if(!q) return;
		const idx = records.findIndex(r =>
			(r.workerNumber||'').includes(q) ||
			(r.workerName||'').toLowerCase().includes(q.toLowerCase()) ||
			(r.product||'').toLowerCase().includes(q.toLowerCase())
		);
		if(idx >= 0){ currentIndex = idx; populateForm(); }
		else alert('لم يتم العثور على تطابق.');
	}
	function actionClose(){
		document.querySelector('.container').style.display = 'none';
	}

	// date change: only update form value, do NOT modify stored records until Save pressed
	function onDateChange(){
		// nothing to do; field already updated by browser
	}

	// Excel import helpers
	function excelCellToISODate(v){
		if(v === null || v === undefined || v === '') return '';
		if(Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return v.toISOString().slice(0,10);
		if(typeof v === 'number'){
			const jsDate = new Date((v - 25569) * 86400 * 1000);
			if(!isNaN(jsDate)) return jsDate.toISOString().slice(0,10);
		}
		const d = new Date(v);
		if(!isNaN(d)) return d.toISOString().slice(0,10);
		return String(v).trim();
	}
	const headerAliases = {
		workerNumber: ['رقم العامل','worker number','workernumber','رقم','id'],
		workerName: ['اسم العامل','worker name','workername','name'],
		product: ['المنتج','product','product name','item'],
		quantity: ['الكمية','quantity','qty','amount'],
		date: ['التاريخ','date','day'],
		comments: ['تعليق','comments','note','notes']
	};
	function mapHeaderIndexes(headerRow){
		const map = {};
		const lower = headerRow.map(h => (h||'').toString().trim().toLowerCase());
		for(const key of Object.keys(headerAliases)){
			for(let i=0;i<lower.length;i++){
				if(!lower[i]) continue;
				for(const alias of headerAliases[key]){
					if(lower[i] === alias){ map[key]=i; break; }
				}
				if(map[key] !== undefined) break;
			}
		}
		return map;
	}
	function importExcelFile(file){
		if(!file) return alert('لم يتم اختيار ملف.');
		const reader = new FileReader();
		reader.onload = function(evt){
			try{
				const data = new Uint8Array(evt.target.result);
				const wb = XLSX.read(data, {type:'array'});
				const first = wb.SheetNames[0];
				const sheet = wb.Sheets[first];
				const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true});
				if(!rows || rows.length < 2) return alert('الملف لا يحتوي على بيانات كافية.');
				const header = rows[0];
				const idx = mapHeaderIndexes(header);
				let added = 0, skipped = 0;
				for(let r=1;r<rows.length;r++){
					const row = rows[r] || [];
					const rec = {
						workerNumber: (idx.workerNumber !== undefined ? (row[idx.workerNumber]||'') : (row[0]||'')).toString().trim(),
						workerName: (idx.workerName !== undefined ? (row[idx.workerName]||'') : (row[1]||'')).toString().trim(),
						product: (idx.product !== undefined ? (row[idx.product]||'') : (row[2]||'')).toString().trim(),
						quantity: Number(idx.quantity !== undefined ? (row[idx.quantity]||0) : (row[3]||0)) || 0,
						date: excelCellToISODate(idx.date !== undefined ? row[idx.date] : row[4]),
						comments: (idx.comments !== undefined ? (row[idx.comments]||'') : (row[5]||'')).toString().trim(),
						created: new Date().toISOString()
					};
					if(!rec.workerNumber && !rec.workerName){ skipped++; continue; }
					const dup = findDuplicateByNumberAndDate(rec.workerNumber, rec.date, -1);
					if(dup !== -1){ skipped++; continue; }
					records.push(rec); added++;
				}
				saveAll();
				populateForm();
				alert(`الاستيراد اكتمل. تم الإضافة: ${added} ، تم التخطي: ${skipped}.`);
			}catch(err){
				console.error(err);
				alert('حدث خطأ أثناء قراءة الملف. تأكد من أنه ملف Excel صالح.');
			}
		};
		reader.onerror = function(){ alert('خطأ في قراءة الملف.'); };
		reader.readAsArrayBuffer(file);
	}

	// compute monthly summary (use daily summaries if present)
	function computeMonthlySummary(monthYYYYMM, bonusPool = 0, bonusPct = 0){
		if(!monthYYYYMM){
			const d = new Date(); monthYYYYMM = d.toISOString().slice(0,7);
		}
		const rawDaily = localStorage.getItem(dailyKey);
		let useDaily = false;
		let dailyMap = {};
		if(rawDaily){
			try{
				const dailyArr = JSON.parse(rawDaily);
				if(Array.isArray(dailyArr) && dailyArr.length){
					dailyArr.forEach(ds=>{ if(ds && ds.date) dailyMap[ds.date] = ds.items || []; });
					useDaily = Object.keys(dailyMap).some(d => d.startsWith(monthYYYYMM));
				}
			}catch(err){ console.warn(err); }
		}
		const items = {}; let totalQty = 0;
		if(useDaily){
			for(const dateKey of Object.keys(dailyMap)){
				if(!dateKey.startsWith(monthYYYYMM)) continue;
				(dailyMap[dateKey]||[]).forEach(it=>{
					const key = (it.workerNumber||'').toString().trim() || ('#'+(it.workerName||'').toString().trim());
					if(!items[key]) items[key] = { workerNumber: it.workerNumber||'', workerName: it.workerName||'', qty:0 };
					items[key].qty += Number(it.qty) || 0; totalQty += Number(it.qty) || 0;
				});
			}
		} else {
			records.forEach(r=>{
				if(!r) return;
				const dt = (r.date||'').toString();
				if(!dt.startsWith(monthYYYYMM)) return;
				const key = (r.workerNumber||'').toString().trim() || ('#'+(r.workerName||'').toString().trim());
				if(!items[key]) items[key] = { workerNumber: r.workerNumber||'', workerName: r.workerName||'', qty:0 };
				items[key].qty += Number(r.quantity) || 0; totalQty += Number(r.quantity) || 0;
			});
		}
		const arr = Object.keys(items).map(k=>{
			const it = items[k];
			const pct = totalQty ? (it.qty / totalQty) : 0;
			const bonus = Number(bonusPool||0) * pct * (1 + (Number(bonusPct||0)/100));
			return { workerNumber: it.workerNumber||'', workerName: it.workerName||'', qty: it.qty, pct, bonus };
		});
		arr.sort((a,b)=> b.qty - a.qty);
		return { month: monthYYYYMM, totalQty, rows: arr, bonusPool: Number(bonusPool||0), bonusPct: Number(bonusPct||0), source: useDaily ? 'daily_summaries' : 'raw_records' };
	}

	function renderMonthlySummary(summary){
		const table = document.getElementById('monthlySummaryTable');
		if(!table) return;
		const tbody = table.querySelector('tbody');
		tbody.innerHTML = '';
		if(!summary || !summary.rows || summary.rows.length === 0){ table.style.display = 'none'; alert('لا توجد بيانات لهذا الشهر.'); return; }
		table.style.display = '';
		let totalBonus = 0;
		summary.rows.forEach(r=>{
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td style="padding:8px;text-align:right">${escapeHtml(r.workerNumber)}</td>
				<td style="padding:8px;text-align:right">${escapeHtml(r.workerName)}</td>
				<td style="padding:8px;text-align:right">${r.qty}</td>
				<td style="padding:8px;text-align:right">${(r.pct*100).toFixed(2)}%</td>
				<td style="padding:8px;text-align:right">${r.bonus.toFixed(2)}</td>
			`;
			tbody.appendChild(tr);
			totalBonus += r.bonus;
		});
		document.getElementById('ms_totalQty').textContent = summary.totalQty || 0;
		document.getElementById('ms_totalPct').textContent = '100%';
		document.getElementById('ms_totalBonus').textContent = totalBonus.toFixed(2);
	}
	function exportSummaryCSV(summary){
		if(!summary) return alert('لا يوجد ملخص للتصدير.');
		const hdr = ['رقم العامل','اسم العامل','إجمالي الكمية','نسبة من الكل (%)','المكافأة'];
		const lines = [hdr.join(',')];
		summary.rows.forEach(r=>{
			lines.push([
				`"${(r.workerNumber||'').toString().replace(/"/g,'""')}"`,
				`"${(r.workerName||'').toString().replace(/"/g,'""')}"`,
				`${r.qty}`,
				`${(r.pct*100).toFixed(2)}`,
				`${r.bonus.toFixed(2)}`
			].join(','));
		});
		lines.push(['', '', summary.totalQty || 0, '100', (summary.rows.reduce((s,x)=>s+x.bonus,0)).toFixed(2)].join(','));
		const csv = lines.join('\n');
		const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href = url; a.download = `monthly_summary_${summary.month}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
	}

	// export CSV for records
	function exportCSV(){
		const idxs = computeFilteredIndexes();
		if(!idxs.length) return alert('لا توجد سجلات للتصدير.');
		const hdr = ['رقم العامل','اسم العامل','المنتج','الكمية','التاريخ','تعليق'];
		const lines = [hdr.join(',')];
		for(const i of idxs){
			const r = records[i];
			const row = [
				`"${(r.workerNumber||'').toString().replace(/"/g,'""')}"`,
				`"${(r.workerName||'').toString().replace(/"/g,'""')}"`,
				`"${(r.product||'').toString().replace(/"/g,'""')}"`,
				`${r.quantity||0}`,
				`"${(r.date||'')}"`,
				`"${(r.comments||'').toString().replace(/"/g,'""')}"`
			];
			lines.push(row.join(','));
		}
		const csv = lines.join('\n');
		const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href = url; a.download = 'production_workers.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
	}

	function clearAllData(){
		if(!confirm('هل أنت متأكد من مسح كل البيانات؟ لا يمكن التراجع.')) return;
		records = []; currentIndex = -1; lastDeleted = null;
		localStorage.removeItem(key);
		renderTable(); populateForm();
		alert('تم مسح البيانات.');
	}

	// wire DOM events
	if(newRecordBtn) newRecordBtn.addEventListener('click', actionNewRecord);
	if(newBtn) newBtn.addEventListener('click', actionNew);
	if(saveBtn) saveBtn.addEventListener('click', actionSave);
	if(addNewBtn) addNewBtn.addEventListener('click', actionSaveAsNew);
	if(deleteBtn) deleteBtn.addEventListener('click', actionDelete);
	if(restoreBtn) restoreBtn.addEventListener('click', actionRestore);
	if(prevBtn) prevBtn.addEventListener('click', actionPrev);
	if(nextBtn) nextBtn.addEventListener('click', actionNext);
	if(criteriaBtn) criteriaBtn.addEventListener('click', actionCriteria);
	if(closeBtn) closeBtn.addEventListener('click', actionClose);
	if(dateEl) dateEl.addEventListener('change', onDateChange);

	// table header sort handlers
	document.querySelectorAll('#recordsTable thead th[data-sort]').forEach(th=>{
		th.addEventListener('click', function(){
			const f = th.getAttribute('data-sort');
			if(sortField === f) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
			else { sortField = f; sortDir = 'asc'; }
			currentPage = 1; renderTable();
		});
	});

	// pagination controls
	const pagePrev = document.getElementById('pagePrev');
	const pageNext = document.getElementById('pageNext');
	const pageSizeSelect = document.getElementById('pageSizeSelect');
	if(pagePrev) pagePrev.addEventListener('click', function(){ if(currentPage>1){ currentPage--; renderTable(); } });
	if(pageNext) pageNext.addEventListener('click', function(){ currentPage++; renderTable(); });
	if(pageSizeSelect){
		pageSizeSelect.value = String(pageSize);
		pageSizeSelect.addEventListener('change', function(e){ pageSize = Number(e.target.value) || 25; currentPage = 1; renderTable(); });
	}

	// search
	if(searchInput){
		searchInput.addEventListener('input', function(e){ filterQuery = e.target.value.trim(); currentPage = 1; renderTable(); });
	}
	if(clearSearchBtn){
		clearSearchBtn.addEventListener('click', function(){ if(searchInput){ searchInput.value=''; filterQuery=''; renderTable(); searchInput.focus(); } });
	}

	// import file (id must be "importFile" in index.html)
	const importFileInput = document.getElementById('importFile');
	if(importFileInput){
		importFileInput.addEventListener('change', function(e){
			const f = e.target.files && e.target.files[0];
			if(f) importExcelFile(f);
			e.target.value = '';
		});
	}

	// summary buttons
	if(calcSummaryBtn){
		calcSummaryBtn.addEventListener('click', function(){
			const monthEl = document.getElementById('summaryMonth');
			const monthVal = monthEl && monthEl.value ? monthEl.value : '';
			const pool = Number(document.getElementById('bonusPool')?.value || 0);
			const pct = Number(document.getElementById('bonusPct')?.value || 0);
			lastComputedSummary = computeMonthlySummary(monthVal, pool, pct);
			renderMonthlySummary(lastComputedSummary);
		});
	}
	if(exportSummaryBtn){
		exportSummaryBtn.addEventListener('click', function(){
			if(!lastComputedSummary) return alert('احسب الملخص أولا.');
			exportSummaryCSV(lastComputedSummary);
		});
	}

	if(exportBtn) exportBtn.addEventListener('click', exportCSV);
	if(clearBtn) clearBtn.addEventListener('click', clearAllData);

	// product/quantity auto-update for selected record
	if(product) product.addEventListener('change', function(e){ if(currentIndex < 0 || !records[currentIndex]) return; records[currentIndex].product = e.target.value.trim(); saveAll(); });
	if(quantity) quantity.addEventListener('change', function(e){ if(currentIndex < 0 || !records[currentIndex]) return; records[currentIndex].quantity = Number(e.target.value) || 0; saveAll(); });

	// Enter key saves (ignore textarea)
	const workerForm = document.getElementById('workerForm');
	if(workerForm){
		workerForm.addEventListener('keydown', function(e){
			if(e.key === 'Enter'){
				const t = e.target;
				if(t && t.tagName && t.tagName.toLowerCase() === 'textarea') return;
				e.preventDefault(); actionSave();
			}
		});
	}

	// keyboard help / shortcuts (basic)
	function toggleHelp(show){
		const panel = document.getElementById('keyboardHelp');
		if(!panel) return;
		panel.hidden = !show;
		panel.setAttribute('aria-hidden', String(!show));
	}
	document.addEventListener('keydown', function(e){
		const ctrl = e.ctrlKey || e.metaKey;
		const alt = e.altKey;
		const shift = e.shiftKey;
		const target = e.target;
		const tag = target && target.tagName ? target.tagName.toLowerCase() : '';

		if(e.key === 'F1' || (e.key === '?' && !ctrl && !alt && !shift)){
			e.preventDefault();
			const panel = document.getElementById('keyboardHelp');
			if(panel) toggleHelp(panel.hidden);
			return;
		}
		if(document.getElementById('keyboardHelp')?.hidden === false){
			if(e.key === 'Escape'){ toggleHelp(false); e.preventDefault(); }
			return;
		}
		if(ctrl && !alt && e.key.toLowerCase() === 's'){ e.preventDefault(); actionSave(); return; }
		if(ctrl && !alt && !shift && e.key.toLowerCase() === 'n'){ e.preventDefault(); actionNewRecord(); return; }
		if(ctrl && !alt && shift && e.key.toLowerCase() === 'n'){ e.preventDefault(); actionNew(); return; }
		if(ctrl && e.key === 'Delete'){ e.preventDefault(); actionDelete(); return; }
		if(ctrl && !alt && e.key.toLowerCase() === 'r'){ e.preventDefault(); actionRestore(); return; }
		if(ctrl && !alt && e.key.toLowerCase() === 'f'){ e.preventDefault(); actionCriteria(); return; }
		if(alt && e.key === 'ArrowUp'){ e.preventDefault(); actionPrev(); return; }
		if(alt && e.key === 'ArrowDown'){ e.preventDefault(); actionNext(); return; }
		if(e.key === 'Home'){ e.preventDefault(); if(records.length){ currentIndex = 0; populateForm(); } return; }
		if(e.key === 'End'){ e.preventDefault(); if(records.length){ currentIndex = records.length - 1; populateForm(); } return; }

		if(tag === 'textarea' || tag === 'input') return;
	});

	const closeHelpBtn = document.getElementById('closeHelp');
	if(closeHelpBtn) closeHelpBtn.addEventListener('click', ()=> toggleHelp(false));

	// init
	load();
})();
