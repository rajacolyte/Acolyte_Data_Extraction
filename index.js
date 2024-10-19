const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const xlsx = require("json-as-xlsx");
const HtmlTableToJson = require('html-table-to-json');
var xl = require('excel4node');

const app = express();

const port = 5000;

app.use(express.json());

app.listen(port,()=>{
    console.log(`Server has started on PORT ${port}`);
});

app.get('/getData',(req,res)=>{
    try {
        const mainData = [];
        axios.get('https://localbodydata.com/panchayat-samitis-list-in-alwar-zila-parishad-78')
        .then(response=>{
            // console.log(response.data);
            const $ = cheerio.load(response.data);
            const tableData = [];
            $('table tr').each((index, element) => {
                const row = {};
                const cells = $(element).find('td, th');
                cells.each((cellIndex, cell) => {
                    const key = $(cells[cellIndex]).text().trim(); // Get header if it's a th
                    const value = $(cell).text().trim();
                    if (index === 0) {
                        row[key] = value; // First row is treated as header
                    } else {
                        row[`column${cellIndex + 1}`] = value; // For data rows
                    }
                });
                if (index > 0) { // Skip header row
                    tableData.push(row);
                }
            })
            // const filterData = JSON.stringify(tableData);
            // console.log(filterData);
            
            tableData.forEach(item=>{
                item.column2 = item.column2.replace(/\s*\(.*?\)\s*/g, '').trim(); // Remove brackets
                item.column2 = item.column2.replace(/\s+/g, '-').toLowerCase(); // Replace spaces with hyphens
                mainData.push({
                    "district": item.column2
                })
                axios.get(`https://localbodydata.com/gram-panchayats-list-in-${item.column2}-panchayat-samiti-${item.column4}`)
                .then(response=>{
                    const $2 = cheerio.load(response.data);
                    const tableData2 = [];
                    $2('table tr').each((index, element) => {
                        const row = {};
                        const cells = $2(element).find('td, th');
                        cells.each((cellIndex, cell) => {
                            const key = $2(cells[cellIndex]).text().trim(); // Get header if it's a th
                            const value = $2(cell).text().trim();
                            if (index === 0) {
                                row[key] = value; // First row is treated as header
                            } else {
                                row[`column${cellIndex + 1}`] = value; // For data rows
                            }
                        });
                        if (index > 0) { // Skip header row
                            tableData2.push(row);
                        }
                    })

                    tableData2.forEach(item=>{
                        item.column2 = item.column2.replace(/\s*\(.*?\)\s*/g, '').trim();
                        item.column2 = item.column2.replace(/\s+/g, '-').toLowerCase();
                        mainData.push({
                            "panchayat": item.column2
                        })
                        axios.get(`https://localbodydata.com/gram-panchayat-${item.column2}-${item.column3}`)
                        .then(response=>{
                            const $3 = cheerio.load(response.data);
                            const tables = $3('table');
                            const allTablesJson = [];
                            tables.each((index, table) => {
                                const isHorizontal = $(table).find('th').length < $(table).find('tr').length;
                                allTablesJson.push({
                                    table: index + 1,
                                    data: isHorizontal ? horizontalTableToJson(table,$3) : tableToJson(table,$3)
                                });
                            });
                            allTablesJson.forEach(tablejson=>{
                                // console.log("tablejson",tablejson);
                                
                                if(tablejson.table == 2){
                                    mainData.push({
                                        "address": `${tablejson?.data?.headers[1]}, ${tablejson?.data?.data[0][`${tablejson?.data?.headers[1]}`]}, ${tablejson?.data?.data[1][`${tablejson?.data?.headers[1]}`]}, ${tablejson?.data?.data[2][`${tablejson?.data?.headers[1]}`]}`
                                    })
                                }
                                if(tablejson.table == 7){
                                    tablejson?.data?.data?.forEach(profileData=>{
                                        mainData.push({
                                            "name": profileData.Name,
                                            "designation":profileData.Designation,
                                            "mobile":profileData["Mobile No"],
                                            "email":profileData.Email
                                        })
                                    })
                                }
                            })
                        })
                        .catch(err=>console.log(err));
                    })
                    // console.log(tableData2);
                    // res.status(200).send({data:tableData2})
                })
                .catch(err=>console.log(err))
            })
        })
        .catch(err=>console.log(err));
        console.log(mainData);
        res.status(200).send({ data: mainData })
    } catch (error) {
        console.log(error);
        res.status(500).send({ message: error.message });
    }
})

app.get('/getVillageData/:villageName/:lgdCode', async (req,res) => {
    try {
        const { villageName, lgdCode } = req.params;
        const mainData = [];
        const response = await axios.get(`https://localbodydata.com/gram-panchayat-${villageName}-${lgdCode}`);
        const $ = cheerio.load(response.data);
        
        // Find all tables
        const tables = $('table');
        const tableData = [];

        // Iterate through each table
        tables.each((index, table) => {
            const headers = [];
            const rows = [];

            // Get headers
            $(table).find('th').each((i, th) => {
                headers.push($(th).text().trim());
            });

            // Get rows
            $(table).find('tr').each((i, row) => {
                const cols = [];
                $(row).find('td').each((j, td) => {
                    cols.push($(td).text().trim());
                });

                // Only add rows with data
                if (cols.length) {
                    rows.push(cols);
                }
            });

            // Create a structured representation of the table
            tableData.push({ headers, rows });
        });

        tableData.map((x,i) => {
            x.index = i;
        })

        tableData.map(x => {
            if(x.index == 0 || x.index == 1){
                let result = {};
                x.headers.forEach((header, index) => {
                    result[header] = x.rows[index][0];
                });
                mainData.push(result)
            }
            if(x.index == 6){
                let convertData = convertToDesiredFormat(x);
                mainData.push(convertData)
            }
        })

        const mergedObject = {
            ...mainData[0],
            ...mainData[1]
        };
        
        mainData.splice(0, 2, mergedObject);

        const structuredData = {
            "Info": mergedObject,
            "Members": mainData[1]
        };
        
        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Sheet 1');

        const fields = [
            "District",
            "Panchayat",
            "Address",
            "Name",
            "Designation",
            "Mobile No",
            "Email"
        ];

        fields.forEach((header, index) => {
            ws.cell(1, index + 1).string(header);
        });

        var addressStr = '';

        if(structuredData.Info["Address Line 1"] != ""){
            addressStr += `${structuredData.Info["Address Line 1"]},`;
        }
        if(structuredData.Info["Address Line 2"] != ""){
            addressStr += `${structuredData.Info["Address Line 2"]},`;
        }
        if(structuredData.Info["Address Line 3"] != ""){
            addressStr += `${structuredData.Info["Address Line 3"]},`;
        }
        if(structuredData.Info.Pincode != ""){
            addressStr += `${structuredData.Info.Pincode},`;
        }

        for (let i = 0; i < structuredData.Members.length; i++) {
            const baseRow = i + 2;
            const element = structuredData.Members[i];
            if(baseRow == 2){
                if(structuredData.Info["District Panchayat"] != "")
                    ws.cell(baseRow,1).string(structuredData.Info["District Panchayat"])
                if(structuredData.Info["Inter Panchayat"] != "")
                    ws.cell(baseRow,2).string(structuredData.Info["Inter Panchayat"])
                if(addressStr != '')
                    ws.cell(baseRow,3).string(addressStr)
            }
            if(element.Name != "")
                ws.cell(baseRow,4).string(element.Name)
            if(element.Designation != "")
                ws.cell(baseRow,5).string(element.Designation)
            if(element["Mobile No"] != "")
                ws.cell(baseRow,6).string(element["Mobile No"])
            if(element.Email != "")
                ws.cell(baseRow,7).string(element.Email)
        }

        const filePath = 'output.xlsx';
        wb.write(filePath, (err) => {
            if (err) {
                return res.status(500).send('Error generating file');
            }

            // Set headers to force download
            res.download(filePath, 'output.xlsx', (err) => {
                if (err) {
                    console.error('Error sending file:', err);
                }
            });
        });

        // console.log(structuredData);
        // res.status(200).send({ message: 'done' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: error.message });
    }
})



function tableToJson(table,$) {
    const headers = [];
    const data = [];

    // Get headers
    $(table).find('tr').first().find('th, td').each((index, element) => {
        headers.push($(element).text().trim());
    });

    // Get rows
    $(table).find('tr').slice(1).each((index, element) => {
        const row = {};
        $(element).find('th, td').each((i, el) => {
            row[headers[i]] = $(el).text().trim();
        });
        data.push(row);
    });

    return { headers, data };
}

function horizontalTableToJson(table,$) {
    const data = [];
    $(table).find('tr').each((index, row) => {
        const rowData = {};
        $(row).find('th, td').each((i, cell) => {
            rowData[`column_${i}`] = $(cell).text().trim();
        });
        data.push(rowData);
    });

    return data;
}

// function extractTables(url) {
//     try {
//         // Fetch the HTML content
//         const { data } = axios.get(url);
//         const $ = cheerio.load(data);
        
//         // Find all tables
//         const tables = $('table');
//         const tableData = [];

//         // Iterate through each table
//         tables.each((index, table) => {
//             const headers = [];
//             const rows = [];

//             // Get headers
//             $(table).find('th').each((i, th) => {
//                 headers.push($(th).text().trim());
//             });

//             // Get rows
//             $(table).find('tr').each((i, row) => {
//                 const cols = [];
//                 $(row).find('td').each((j, td) => {
//                     cols.push($(td).text().trim());
//                 });

//                 // Only add rows with data
//                 if (cols.length) {
//                     rows.push(cols);
//                 }
//             });

//             // Create a structured representation of the table
//             tableData.push({ headers, rows });
//         });

//         // Output the extracted tables
//         tableData.forEach((table, i) => {
//             console.log(`Table ${i + 1}:`);
//             console.log('Headers:', table.headers);
//             console.log('Rows:', table.rows);
//             console.log();
//         });

//     } catch (error) {
//         console.error('Error fetching data:', error);
//     }
// }

const convertToDesiredFormat = (data) => {
    const { headers, rows } = data;

    // Map rows to objects based on headers
    return rows.map(row => {
        return headers.reduce((acc, header, index) => {
            acc[header] = row[index];
            return acc;
        }, {});
    });
};