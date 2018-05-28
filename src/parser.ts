import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as querystring from 'querystring';

const moment = require('moment-timezone');

const request = require('request');
const baseUrl = 'https://avto.pro';

/**
 * Куда сохранить файл?
 */
const filename = `/Users/skalashnyk/products_${moment().tz('Europe/Kiev').format('YYYY-MM-DD_HH-mm')}.csv`;

/**
 * Отсекать цены, превышающие {skip} % минимальной цены
 */
const skip = 200;

/**
 *  Производители
 */
const makers = [
  'Ashika',
  'Blue Print',
  'Brembo',
  'Champion',
  'Donaldson',
  'Ferodo',
  'Filtron',
  'Hengst',
  'Japan Cars',
  'Japan Parts',
  'JC Premium',
  'Kashiyama',
  'Knecht-Mahle',
  'Kolbenschmidt',
  'LPR',
  'Mfilter',
  'MAN',
  'Mann-Filter',
  'Meyle',
  'Parts-Mall',
  'Profit',
  'Remsa',
  'Textar',
  'TRW',
  'WIX'
];

const prefs = 'SearchSESSID=20180528064645-7bc4d1fe-9bbd-4c47-a1db-67f6aaa25c93; country=%d0%a3%d0%ba%d1%80%d0%b0%d0%b8%d0%bd%d0%b0; city=%d0%9a%d0%b8%d0%b5%d0%b2; pref=%7B%22IsOpt%22%3Afalse%2C%22Retail%22%3Atrue%2C%22Original%22%3Atrue%2C%22Analog%22%3Atrue%2C%22Used%22%3Afalse%2C%22DeliveryFromCountry%22%3Anull%2C%22DeliveryFromCity%22%3Anull%2C%22DeliveryToCountry%22%3Anull%2C%22DeliveryToCity%22%3Anull%2C%22DeliveryFromCountryISO%22%3A%22UA%22%2C%22DeliveryFromCityId%22%3Anull%2C%22DeliveryToCountryISO%22%3A%22UA%22%2C%22DeliveryToCityId%22%3A703448%2C%22LowPrice%22%3Atrue%2C%22ShowCardismantlings%22%3Atrue%2C%22InStock%22%3A%22all%22%2C%22Currency%22%3A%22UAH%22%2C%22Paging%22%3A1000%2C%22PartsGrouping%22%3A%22analogs-and-originals%22%2C%22Sort%22%3A%22rating%22%2C%22Device%22%3A0%2C%22UserInShoppingCart%22%3A%5B%5D%7D'
let globalCookie = '';

function getHtml(url: string): Promise<string> {
  return new Promise<string>(resolve => {
    request({
      uri: url,
      headers: {'cookie': globalCookie}
    }, (error: any, response: any, body: string) => {
      if (error)
        console.error(error)
      resolve(body);
    })
  });
}

function login(): Promise<string> {
  return new Promise<string>(resolve => {
    request({
      uri: baseUrl + '/api/v1/account/sign-in',
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: querystring.stringify({Login: 'kalashnyck@gmail.com', Password: 'qwerty'})
    }, (err: any, res: any, body: any) => {
      let cookie = ''
      res.headers['set-cookie'].forEach((e: string) => {
        if (e.indexOf('APD') !== -1 || e.indexOf('_BpanelUser') !== -1 || e.indexOf('_bpuexp') !== -1) {
          for (let c of e.split(';')) {
            const singleCookie = c.trim();
            if (singleCookie.indexOf('APD') !== -1 || singleCookie.indexOf('_BpanelUser') !== -1 || singleCookie.indexOf('_bpuexp') !== -1) {
              cookie += singleCookie + ';';
              break;
            }
          }
        }
      });
      resolve(cookie)
    })
  })
}

login()
  .then(cookie => {
    globalCookie = cookie + prefs;

    return getMakersUrl()
  })
  .then(async (makers: { [maker: string]: string }) => {
    fs.writeFileSync(filename, 'Бренд,Код,Type,"Sakura код","Мин.цена (грн.)","Макс.цена (грн.)","Ср.цена (грн.)","Sakura мин.цена (грн.)","Sakura макс.цена (грн.)","Sakura ср.цена (грн.)",Url\n');
    const total = [];
    for (let maker in makers) {
      const makerHtml = await getHtml(baseUrl + makers[maker]);
      const parts = getElements(makerHtml, maker);
      for (let i = 0; i < parts.length; i++) {
        const start = Date.now();
        const productHtml: string = await getHtml(baseUrl + parts[i].path);
        const end1 = Date.now();
        console.log(`Request took ${end1-start}ms`);
        const p = processProductHtml(productHtml, parts[i]);
        const end2 = Date.now();
        console.log(`Parsing took ${end2-end1}ms`);
        total.push(p);
        fs.appendFileSync(filename, `${p.brand},${p.id},"${p.type}",${p.sakuraSubstitutor || '-'},${p.minPrice|| '-'},${p.maxPrice|| '-'},${p.avgPrice|| '-'},${p.sakuraMinPrice || '-'},${p.sakuraMaxPrice || '-'},${p.sakuraAvgPrice || '-'},${baseUrl + p.path}\n`)
      }
    }

    console.log(total)
  });

getHtml('https://avto.pro/makers/mann/')
  .then(async body => {
    const arr = getElements(body, 'Mann-Filter');
    // console.log(arr)


  });

function getElements(body: string, brand: string): { id: string, brand: string, type: string, path: string }[] {
  const res: any = [];
  const $ = cheerio.load(body);

  $('.table-responsive').children('table')
    .each((i, e) => {
      e.children.forEach(elem => {
        if (elem.type === 'tag' && elem.tagName === 'tbody')
          elem.children.forEach(rowElem => {
            if (rowElem.type === 'tag' && rowElem.tagName === 'tr') {
              const row = rowElem.children[0].firstChild;
              res.push({
                brand,
                id: row.firstChild.firstChild.data,
                type: rowElem.children[1].firstChild.firstChild.data,
                path: row.attribs.href
              })
            }
          })
      })
    });

  return res;
}

function processProductHtml(body: string, product: Product): Product {
  // console.log(body)
  console.log(`Start processing ${product.brand} ${product.id}`)
  const $ = cheerio.load(body);
  $('#js-partslist-primary')
    .children('tbody')
    .children('tr')
    .each((index, row) => {
      const brand = row.children[0].firstChild.firstChild.data;
      if (brand && (brand === product.brand || brand === 'Sakura')) {
        const price = parseFloat(row.children[4].attribs['data-value']);
        if (!Number.isNaN(price)) {
          if (brand === 'Sakura') {
            product.sakuraPrices ? product.sakuraPrices.push(price) : product.sakuraPrices = [price];
            product.sakuraSubstitutor = row.children[1].firstChild.firstChild.data;
          } else
            product.prices ? product.prices.push(price) : product.prices = [price];
        }
      }
    });

  const result = Object.assign(product, getPrices(product.prices as number[], false), getPrices(product.sakuraPrices as number[], true))
  // console.log(result);

  return result;
}

class Product {
  id?: string;
  brand?: string;
  path?: string;
  type?: string;
  sakuraSubstitutor?: string;
  sakuraPrices?: number[] = [];

  prices?: Array<number> = [];
  maxPrice?: number;
  minPrice?: number;
  avgPrice?: number;
  offersNo?: number;

  sakuraMaxPrice?: number;
  sakuraMinPrice?: number;
  sakuraAvgPrice?: number;
  sakuraOffersNo?: number;
}


function getPrices(prices: number[], sakura: boolean): { maxPrice?: number, minPrice?: number, avgPrice?: number } | { sakuraMaxPrice?: number, sakuraMinPrice?: number, sakuraAvgPrice?: number } {
  if (!prices || prices.length === 0)
    return {};

  prices.sort((a, b) => {
    if (a < b)
      return -1;
    return 1;
  });

  let sum = 0;
  let qty = 0;
  let minPrice = prices[0];
  let maxPrice = prices[prices.length - 1];

  for (let i = 0; i < prices.length; i++) {
    const current = prices[i];
    if (current > minPrice * (skip/100)) {
      maxPrice = prices[i - 1];
      break;
    }

    sum += current;
    qty++;
  }

  return {
    [sakura ? 'sakuraMaxPrice' : `maxPrice`]: maxPrice,
    [sakura ? 'sakuraMinPrice' : `minPrice`]: minPrice,
    [sakura ? 'sakuraAvgPrice' : `avgPrice`]: Math.round(sum / qty * 100) / 100
  };
}


async function getMakersUrl(): Promise<{ [brand: string]: string }> {
  const result: any = {};
  const body = await getHtml(baseUrl + '/makers');
  const $ = cheerio.load(body);


  $('#js-makers-list')
    .children('ul')
    .each((i, column) => {
      column.children.forEach((li) => {
        const maker = li.firstChild;
        if (makers.indexOf((maker.firstChild.data || maker.firstChild.firstChild.data)as string) !== -1)
          result[`${maker.firstChild.data || maker.firstChild.firstChild.data}`] = maker.attribs.href;
      })
    });

  return result;
}