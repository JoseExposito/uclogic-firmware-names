import * as child_process from 'child_process';
import * as fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { rimraf } from 'rimraf';
import { URL } from 'url';
import * as util from 'util';

const DOWNLOADS_PATH = 'downloads';
const TMP_PATH = path.resolve(DOWNLOADS_PATH, 'tmp');
const RESULTS_FILE = 'uclogic-firmware-names.json';

const DRIVER_URL_15_0_0_89 = 'https://driverdl.huion.com/driver/Linux/HuionTablet_v15.0.0.89.202205241352.x86_64.deb';
const DRIVER_URL_15_0_0_103 = 'https://driverdl.huion.com/driver/X10_G930L_Q630M/HuionTablet_v15.0.0.103.202208301443.x86_64.deb';
const DRIVER_URL_15_0_0_121 = 'https://driverdl.huion.com/driver/Linux/HuionTablet_v15.0.0.121.202301131103.x86_64.deb';

const downloadDriver = async (driverUrl) => {
    const filename = path.basename(new URL(driverUrl).pathname);
    const destination = path.resolve(DOWNLOADS_PATH, filename);

    if (!fs.existsSync(DOWNLOADS_PATH)) {
        fs.mkdirSync(DOWNLOADS_PATH);
    }

    if (fs.existsSync(destination)) {
        console.log(`File "${destination}" already exists, not downloading it again`);
        return destination;
    }

    const res = await fetch(driverUrl);
    const fileStream = fs.createWriteStream(destination, { flags: 'wx' });
    await finished(Readable.fromWeb(res.body).pipe(fileStream));

    return destination;
}

const extractDriver = async (driverPath) => {
    if (fs.existsSync(TMP_PATH)) {
        await rimraf(TMP_PATH);
    }
    fs.mkdirSync(TMP_PATH);

    // For the sake of simplicity, use system `ar` and `tar` commands
    const exec = util.promisify(child_process.exec);
    await exec(`ar x --output ${TMP_PATH} ${driverPath}`);
    await exec(`tar -xf ${path.resolve(TMP_PATH, 'data.tar.xz')} -C ${TMP_PATH}`);
}

const parseHuionFirmwareNames = () => {
    const huionJsonPath = path.resolve(TMP_PATH, 'usr', 'lib', 'huiontablet', 'res', 'StatuImg.js');
    const huionJsonContents = fs.readFileSync(huionJsonPath, 'utf-8');
    const huionJsonContentsSanitized = huionJsonContents.replace('\0', '');
    const huionJson = JSON.parse(huionJsonContentsSanitized);
    
    const result = Object.fromEntries(
        Object.entries(huionJson)
            .map(([firmware, { ProductName }]) => ([firmware, ProductName]))
            .filter(([firmware, ProductName]) => !!ProductName) // Remove empty product names
    );
    
    console.log(`Found ${Object.keys(result).length} unique firmware names`);

    return result;
}

const outputFirmwareNames = (currentResults) => {
    let existingResults = {};
    if (fs.existsSync(RESULTS_FILE)) {
        console.log('Result from a previous execution found, merging');
        existingResults = JSON.parse(fs.readFileSync(RESULTS_FILE));
    }

    for (const [firmware, product] of Object.entries(currentResults)) {
        if (existingResults[firmware] && existingResults[firmware] != product) {
            console.log(`WARNING: Firmware "${firmware}" found in existing results file with product "${existingResults[firmware]}" will be overridden with product name "${product}"`);
        }
        existingResults[firmware] = product;
    }

    fs.writeFileSync(RESULTS_FILE, JSON.stringify(existingResults, null, 2), 'utf-8');
}

const main = async (driverUrl) => {
    console.log(`Downloading driver from ${driverUrl}`);
    const driverPath = await downloadDriver(driverUrl);

    console.log('Extracting driver');
    await extractDriver(driverPath);

    console.log('Parsing firmware names');
    const result = await parseHuionFirmwareNames();

    console.log(`Saving results in ${RESULTS_FILE}`);
    outputFirmwareNames(result);
}

main(DRIVER_URL_15_0_0_121);
