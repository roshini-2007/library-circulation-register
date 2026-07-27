

const STATUS_PRIORITY = { "Overdue": 0, "Issued": 1, "Returned": 2, "Incomplete record": 3 };
let currentRecords = [];   // last data received from the server
let loadFailed = false;

function todayStr() {
    return new Date().toISOString().split("T")[0];
}

/* ============================================================
   TAB SWITCHING
   ============================================================ */
function showScreen(name) {
    document.getElementById("screen-issue").classList.toggle("active", name === "issue");
    document.getElementById("screen-records").classList.toggle("active", name === "records");
    document.getElementById("tab-issue").classList.toggle("active", name === "issue");
    document.getElementById("tab-records").classList.toggle("active", name === "records");
    if (name === "records") loadRecords();
}

/* ============================================================
   LOAD RECORDS FROM THE SERVER (Task 4: handle loading/failure)
   ============================================================ */
function loadRecords() {
    document.getElementById("records-state").innerHTML =
        '<div class="state-box state-empty">Loading records...</div>';

    fetch("/api/records")
        .then(res => {
            if (!res.ok) throw new Error("Server error");
            return res.json();
        })
        .then(data => {
            loadFailed = false;
            currentRecords = data.records;
            renderRecords();
        })
        .catch(() => {
            loadFailed = true;
            document.getElementById("records-state").innerHTML =
                '<div class="state-box state-error">Could not load records from the server. ' +
                '<button onclick="loadRecords()">Try again</button></div>';
            document.getElementById("records-table").style.display = "none";
            document.getElementById("count-line").textContent = "";
        });
}

/* ============================================================
   ADD RECORD  (server validates - Task 2, Change 1, Change 2)
   ============================================================ */
document.getElementById("issue-form").addEventListener("submit", function (event) {
    event.preventDefault();

    const payload = {
        bookId: document.getElementById("book_id").value,
        title: document.getElementById("title").value,
        memberName: document.getElementById("member_name").value,
        issueDate: document.getElementById("issue_date").value,
        dueDate: document.getElementById("due_date").value
    };

    const errorBox = document.getElementById("issue-errors");
    errorBox.innerHTML = "";

    fetch("/api/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
        .then(async res => {
            const data = await res.json();
            if (!res.ok) {
                // Server rejected it (bad field, or the book is already
                // out - Change 1 / Change 2). Show exactly why.
                errorBox.innerHTML = '<div class="state-box state-error"><ul>' +
                    data.errors.map(e => `<li>${e}</li>`).join("") + "</ul></div>";
                return;
            }
            document.getElementById("issue-form").reset();
            document.getElementById("issue_date").value = todayStr();
            showScreen("records");
        })
        .catch(() => {
            errorBox.innerHTML = '<div class="state-box state-error">' +
                "Could not reach the server. The record was NOT saved - please try again.</div>";
        });
});

/* ============================================================
   RENDER: search, filter, order, count, states (Task 3 + 4)
   ============================================================ */
function clearFilters() {
    document.getElementById("search-box").value = "";
    document.getElementById("status-filter").value = "All";
    renderRecords();
}

function renderRecords() {
    if (loadFailed) return;

    const searchText = document.getElementById("search-box").value.trim().toLowerCase();
    const statusFilter = document.getElementById("status-filter").value;

    let filtered = currentRecords;
    if (searchText) {
        filtered = filtered.filter(r =>
            (r.bookId || "").toLowerCase().includes(searchText) ||
            (r.title || "").toLowerCase().includes(searchText) ||
            (r.memberName || "").toLowerCase().includes(searchText)
        );
    }
    if (statusFilter !== "All") {
        filtered = filtered.filter(r => r.status === statusFilter);
    }

    filtered = filtered.slice().sort((a, b) => {
        const pa = STATUS_PRIORITY[a.status] ?? 9;
        const pb = STATUS_PRIORITY[b.status] ?? 9;
        if (pa !== pb) return pa - pb;
        const da = typeof a.overdueDays === "number" ? a.overdueDays : 0;
        const db = typeof b.overdueDays === "number" ? b.overdueDays : 0;
        return db - da;
    });

    document.getElementById("count-line").textContent =
        `Showing ${filtered.length} of ${currentRecords.length} records` +
        ((searchText || statusFilter !== "All") ? " (filtered)" : "");

    const stateBox = document.getElementById("records-state");
    const table = document.getElementById("records-table");

    if (currentRecords.length === 0) {
        stateBox.innerHTML = '<div class="state-box state-empty">No records yet. Issue a book to get started.</div>';
        table.style.display = "none";
    } else if (filtered.length === 0) {
        stateBox.innerHTML = '<div class="state-box state-empty">No records match your search/filter. Try clearing the filters.</div>';
        table.style.display = "none";
    } else {
        stateBox.innerHTML = "";
        table.style.display = "table";
        renderTableRows(filtered);
    }

    renderMostBorrowed(currentRecords);
}

function renderTableRows(rows) {
    document.getElementById("records-body").innerHTML = rows.map(r => `
        <tr>
            <td>${r.id}</td>
            <td>${r.bookId || "-"}</td>
            <td>${r.title || "-"}</td>
            <td>${r.memberName || "-"}</td>
            <td>${r.issueDate || "-"}</td>
            <td>${r.dueDate || "-"}</td>
            <td>${r.returnDate || "-"}</td>
            <td class="${r.status}">${r.status}</td>
            <td>${r.overdueDays}</td>
            <td>
                ${(r.status === "Issued" || r.status === "Overdue")
                    ? `<button onclick="markReturned(${r.id})">Mark Returned</button>`
                    : ""}
            </td>
        </tr>
    `).join("");
}

function renderMostBorrowed(all) {
    const counts = {};
    all.forEach(r => { if (r.title) counts[r.title] = (counts[r.title] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    document.getElementById("most-borrowed-list").innerHTML = sorted.length
        ? sorted.map(([title, count]) => `<li>${title} — ${count} time(s)</li>`).join("")
        : "<li>No titles to rank yet.</li>";
}

/* ============================================================
   MARK RETURNED
   ============================================================ */
function markReturned(id) {
    if (!confirm("Mark this book as returned today?")) return;

    fetch(`/api/return/${id}`, { method: "POST" })
        .then(res => {
            if (!res.ok) throw new Error("failed");
            return loadRecords();
        })
        .catch(() => alert("Could not update this record. Please try again."));
}

/* Default issue date to today, then load whatever the server has */
document.getElementById("issue_date").value = todayStr();