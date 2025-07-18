function getCurrentDate() {
	var today = new Date();
	var year = today.getFullYear();
	var month = (today.getMonth() + 1).toString().padStart(2, '0');
	var day = today.getDate().toString().padStart(2, '0');
	return year + month + day;
}


let isEnabled = new URL(window.location.href).searchParams.get("export") == "1"
if (isEnabled) {

	var csv = "date,service,title,action,point,note\n"

	var pagination = document.querySelector('.pagination');
	var nextButton = pagination.children[pagination.children.length - 1]

	var tableBodyContent = document.querySelector('.history-table tbody')
	for (var i = 0; i < tableBodyContent.children.length; i++) {
		var row = tableBodyContent.children[i]
		try {
			let date = row.querySelector(".date").innerText.replaceAll("\n", "/").replaceAll(",", "")
			let service = row.querySelector(".service").innerText.trim().replaceAll("\n", " ").replaceAll(",", "")
			let title = row.querySelector(".detail").innerText.trim().split("\n")[0].replaceAll(",", "")
			let action = row.querySelector(".action").innerText.trim().replaceAll("\n", ".").replaceAll(",", "")
			let point = row.querySelector(".point").innerText.trim().replaceAll("\n", "").replaceAll(",", "")
                        let note = row.querySelector(".note").innerText.trim().replaceAll("\r", "").replaceAll(",", "")
                        note = note.replaceAll('"', '""')
                        if (note.includes("\n")) {
                                note = `"${note}"`
                        }

			csv += date + "," + service + "," + title + "," + action + "," + point + "," + note + "\n"
		} catch (e) {
		}
	}

	// download csv
	var blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), new TextEncoder().encode(csv)], { type: "text/csv;charset=Shift-JIS" });
	var downloadUrl = URL.createObjectURL(blob);
	let currentPage = new URL(window.location.href).searchParams.get("page")
	if (currentPage == null) {
		currentPage = "1"
	}
	let link = document.createElement("a")
	link.href = downloadUrl
	link.download = "rakuten-point-history_" + getCurrentDate() + "_" + currentPage + ".csv"
	link.click()

	// open next page in new tab
	if (nextButton.innerText == "NEXT") {
		var nextUrl = nextButton.querySelector("a").href.replace("#point_history", "") + "&export=1#point_history"
		setTimeout(() => {
			window.open(nextUrl)
			window.close()
		}, 3000);
	} else {
		window.alert("全履歴の保存が完了しました")
		window.close()
	}
}
