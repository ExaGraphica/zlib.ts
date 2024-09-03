function downloadFile(arr, name){
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([arr]));
    a.download = name;
    document.body.appendChild(a);
    a.click();
}