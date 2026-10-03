(function(){
	const RECORDS_KEY = 'production_workers_v1';
	const DAILY_KEY = 'daily_summaries_v1';

	const ds_date = document.getElementById('ds_date');
	const ds_compute = document.getElementById('ds_compute');
	const ds_save = document.getElementById('ds_save');
	const ds_clear = document.getElementById('ds_clear');
	const ds_table = document.getElementById('ds_table');
	const ds_tbody = ds_table.querySelector('tbody');
	const ds_list = document.getElementById('ds_list');

	let currentSummary = null; // {date, items: [{workerNumber, workerName, qty}]}

	function loadRecords(){
		const raw = localStorage.getItem(RECORDS_KEY);
		return raw ? JSON.parse(raw) : [];
	}
	function loadDaily(){
		const raw = localStorage.getItem(DAILY_KEY);
		return raw ? JSON.parse(raw) : [];
	}
	function saveDaily(arr){
		localStorage.setItem(DAILY_KEY, JSON.stringify(arr));
	}

	function computeForDate(dateStr){
		if(!dateStr) return null;
		const records = loadRecords();
		const map = {};
		for(const r of records){
			if(!r || !r.date) continue;
			if(r.date !== dateStr) continue;
			const key = (r.workerNumber||'').toString().trim() || ('#'+(r.workerName||'').toString().trim());
			if(!map[key]) map[key] = { workerNumber: r.workerNumber||'', workerName: r.workerName||'', qty:0 };
			map[key].qty += Number(r.quantity) || 0;
		}
		const items = Object.keys(map).map(k=>map[k]).filter(it=>it.qty > 0);
		items.sort((a,b)=> b.qty - a.qty);
		return { date: dateStr, items };
	}

	function renderComputed(summary){
		ds_tbody.innerHTML = '';
		if(!summary || !summary.items || summary.items.length === 0){
			ds_table.style.display = 'none';
			ds_save.disabled = true;
			return;
		}
		ds_table.style.display = '';
		for(const it of summary.items){
			const tr = document.createElement('tr');
			tr.innerHTML = `<td style="padding:8px;text-align:right">${escapeHtml(it.workerNumber)}</td>
				<td style="padding:8px;text-align:right">${escapeHtml(it.workerName)}</td>
				<td style="padding:8px;text-align:right">${it.qty}</td>`;
			ds_tbody.appendChild(tr);
		}
		ds_save.disabled = false;
	}

	function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

	// list saved daily summaries
	function renderSavedList(){
		const arr = loadDaily();
		ds_list.innerHTML = '';
		if(!arr || arr.length===0){ ds_list.innerHTML = '<li>لا توجد ملخصات محفوظة</li>'; return; }
		// sort descending by date
		arr.sort((a,b)=> b.date.localeCompare(a.date));
		for(const ds of arr){
			const li = document.createElement('li');
			const d = ds.date;
			const total = (ds.items||[]).reduce((s,it)=>s+Number(it.qty||0),0);
			li.innerHTML = `<strong>${d}</strong> — إجمالي: ${total}
				<button data-date="${d}" class="load">عرض</button>
				<button data-date="${d}" class="delete">حذف</button>`;
			ds_list.appendChild(li);
		}
		// attach handlers
		ds_list.querySelectorAll('button.load').forEach(b=>{
			b.addEventListener('click', function(){
				const date = this.getAttribute('data-date');
				const arr = loadDaily();
				const entry = arr.find(e=>e.date===date);
				if(entry){ currentSummary = entry; renderComputed(entry); ds_save.disabled = true; }
			});
		});
		ds_list.querySelectorAll('button.delete').forEach(b=>{
			b.addEventListener('click', function(){
				const date = this.getAttribute('data-date');
				if(!confirm(`حذف ملخص ${date}؟`)) return;
				let arr = loadDaily();
				arr = arr.filter(e=>e.date !== date);
				saveDaily(arr);
				renderSavedList();
				alert('تم الحذف.');
			});
		});
	}

	// compute button
	ds_compute.addEventListener('click', function(){
		const d = ds_date.value;
		if(!d) return alert('اختر تاريخاً أولاً.');
		const summary = computeForDate(d);
		currentSummary = summary;
		renderComputed(summary);
	});

	// save daily summary
	ds_save.addEventListener('click', function(){
		if(!currentSummary || !currentSummary.date) return alert('لا يوجد ملخص للحفظ.');
		let arr = loadDaily();
		// replace existing for same date
		arr = arr.filter(e=>e.date !== currentSummary.date);
		arr.push({ date: currentSummary.date, items: currentSummary.items, created: new Date().toISOString() });
		saveDaily(arr);
		renderSavedList();
		ds_save.disabled = true;
		alert('تم حفظ ملخص اليوم.');
	});

	// clear saved for date
	ds_clear.addEventListener('click', function(){
		const d = ds_date.value;
		if(!d) return alert('اختر تاريخاً.');
		if(!confirm(`مسح الملخص المحفوظ لـ ${d} ؟`)) return;
		let arr = loadDaily();
		arr = arr.filter(e=>e.date !== d);
		saveDaily(arr);
		renderSavedList();
		alert('تم المسح.');
	});

	// init
	renderSavedList();
})();
